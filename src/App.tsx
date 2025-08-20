import React, { useEffect, useMemo, useState } from "react";
import { Crown, User2, Gamepad2, Users2, Info } from "lucide-react";

// ==== API ====
import {
  initUser,
  getBalance as apiGetBalance,
  bet as apiBet,
  win as apiWin,
  getLeaderboard,
  type LeaderboardRow,
  getRefLink,
  topup,
  applyRef,
} from "./lib/api";

import { socket } from "./lib/socket";
import DurakScreen from "./screens/Durak";

/* =================== Cards / Blackjack =================== */
const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

type Card = { rank: typeof RANKS[number]; suit: typeof SUITS[number] };

function createDeck() {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function cardValue(rank: string) {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return parseInt(rank, 10);
}
function handValue(cards: { rank: string; suit: string }[]) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

/* =================== Types / UI utils =================== */
type Screen = "menu" | "bet" | "game" | "leaderboard" | "profile" | "partners" | "durak";
type Turn = "player" | "dealer" | "end";
type Result = "win" | "lose" | "push" | null;

type UIHistoryItem = {
  id: string;
  when: string;
  bet: number;
  result: "win" | "lose" | "push";
  you?: number;
  opp?: number;
};

const cn = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
const bg = "bg-[#0a0f14]";
const BLUE = "#2176ff";

/* =================== helpers (id, round, payout) =================== */
function uid(): string {
  const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (tgId) return `tg_${tgId}`;
  const key = "guest_id_v1";
  let g = localStorage.getItem(key);
  if (!g) {
    const r = (globalThis as any)?.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    g = `guest_${r}`;
    localStorage.setItem(key, g);
  }
  return g;
}
const newRoundId = () =>
  (globalThis as any)?.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

const PAYOUT = {
  win: (stake: number) => Math.floor(stake * 1.9),
  push: (stake: number) => stake,
};

/* =================== Малые UI-атомы =================== */
const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; size?: "lg" | "md" | "sm" }
> = ({ className, active, size = "md", ...props }) => (
  <button
    {...props}
    className={cn(
      "rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
      "border border-white/10 text-white",
      active ? "bg-neutral-700 ring-2 ring-[#2176ff]/40" : "bg-white/5 hover:bg-white/10 hover:ring-2 ring-[#2176ff]/30",
      size === "lg" && "h-14 px-6 text-lg",
      size === "md" && "h-12 px-5 text-base",
      size === "sm" && "h-9 px-4 text-sm",
      "backdrop-blur-md shadow-[0_10px_40px_-20px_rgba(0,0,0,.6)]",
      className
    )}
    style={{ outline: "none" }}
  />
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs tracking-wide backdrop-blur-md">
    {children}
  </span>
);

const CardView = ({ c, hidden = false }: { c: Card; hidden?: boolean }) => (
  <div
    className={cn(
      "w-16 h-24 sm:w-20 sm:h-28 rounded-2xl border flex items-center justify-center font-semibold select-none",
      "border-white/10 bg-[#111827]/90 text-white backdrop-blur-md",
      "shadow-[0_14px_28px_-16px_rgba(0,0,0,.8)]",
      hidden && "bg-[#0e141b]/90 border-white/5"
    )}
  >
    {!hidden ? (
      <span className="text-xl sm:text-2xl" style={{ color: c.suit === "♥" || c.suit === "♦" ? BLUE : "#cfe2ff" }}>
        {c.rank}
        <span className="ml-1 opacity-80">{c.suit}</span>
      </span>
    ) : (
      <span className="opacity-30">●●</span>
    )}
  </div>
);

/* ============ Shuffle Deck (menu decoration) ============ */
const ShuffleDeck = () => (
  <>
    <style>{`
      @keyframes shuffleCard {
        0%   { transform: translate(-50%, -50%) rotate(-6deg);   }
        25%  { transform: translate(calc(-50% + 28px), -50%) rotate(2deg); }
        50%  { transform: translate(-50%, -50%) rotate(6deg);    }
        75%  { transform: translate(calc(-50% - 28px), -50%) rotate(-2deg); }
        100% { transform: translate(-50%, -50%) rotate(-6deg);   }
      }
    `}</style>
    <div className="relative mt-6 h-36">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 w-16 h-24 rounded-2xl border backdrop-blur-md"
          style={{
            transform: "translate(-50%, -50%)",
            animation: `shuffleCard 3.2s ease-in-out ${i * 0.18}s infinite`,
            zIndex: 10 + i,
            borderColor: "rgba(255,255,255,0.12)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
            boxShadow: "0 10px 40px -20px rgba(0,0,0,.7), inset 0 0 0 1px rgba(33,118,255,.15)",
          }}
        />
      ))}
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-6 w-40 h-10 rounded-full blur-2xl"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(33,118,255,.25), rgba(33,118,255,0))" }}
      />
    </div>
  </>
);

/* ============ Live Ticker ============ */
const LiveTicker: React.FC = () => {
  const [items, setItems] = useState<{ id: string; amount: number }[]>(
    () => Array.from({ length: 16 }, (_, i) => ({ id: `init_${i}`, amount: [40, 80, 120, 200, 60, 90, 150, 240][i % 8] }))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) => {
        const next = [
          ...prev.slice(1),
          {
            id: (globalThis as any)?.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
            amount: [40, 60, 80, 120, 160, 200, 240][Math.floor(Math.random() * 7)],
          },
        ];
        return next;
      });
    }, 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="px-3 mt-2">
      <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Live
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="flex gap-2 animate-[ticker_14s_linear_infinite] px-2 py-2 will-change-transform">
          {items.map((it) => (
            <div
              key={it.id}
              className="px-4 py-2 rounded-xl border border-white/10 bg-[#0f1723] text-amber-300 font-semibold"
            >
              +{it.amount}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  );
};

/* =================== App =================== */
export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [userId, setUserId] = useState<string>("");

  const [balance, setBalance] = useState<number>(0);

  const [history, setHistory] = useState<UIHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem("history_v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  const [bet, setBet] = useState(25);

  // SOLO blackjack state
  const [deck, setDeck] = useState(createDeck());
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [turn, setTurn] = useState<Turn>("player");
  const [revealed, setRevealed] = useState(false);
  const [roundResult, setRoundResult] = useState<Result>(null);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [stakeOnServer, setStakeOnServer] = useState<number>(0);

  // PvP
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [isQueueing, setIsQueueing] = useState(false);
  const [pvpMode, setPvpMode] = useState(false);
  const [youStood, setYouStood] = useState(false);
  const [oppStood, setOppStood] = useState(false);
  const [oppScore, setOppScore] = useState<number | null>(null);
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  const [pvpSecondsLeft, setPvpSecondsLeft] = useState<number | null>(null);

  // leaderboard
  const [leaders, setLeaders] = useState<LeaderboardRow[] | null>(null);
  const [lbMetric, setLbMetric] = useState<"wins" | "profit">("wins");

  // partners
  const [refLink, setRefLink] = useState<string>("");

  // bet countdown
  const BET_SECONDS = 10;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const pVal = useMemo(() => handValue(player), [player]);
  const dVal = useMemo(() => handValue(dealer), [dealer]);

  useEffect(() => {
    try { localStorage.setItem("history_v1", JSON.stringify(history)); } catch {}
  }, [history]);

  useEffect(() => {
    const id = uid();
    setUserId(id);
    (async () => {
      try {
        await initUser(id);
        const b = await apiGetBalance(id);
        setBalance(b.balance);
        socket.emit("hello", { userId: id });
      } catch (e) {
        console.error(e);
      }
    })();

    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref) applyRef(id, ref).catch(() => {});

    loadLeaderboard("wins").catch(() => {});
    getRefLink(id)
      .then((r) => setRefLink(r.web || r.telegram))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshBalance() {
    try { const b = await apiGetBalance(userId); setBalance(b.balance); } catch {}
  }
  async function loadLeaderboard(metric: "wins" | "profit" = lbMetric) {
    try { const d = await getLeaderboard(metric, 20); setLeaders(d.entries); }
    catch { setLeaders([]); }
  }

  /* ======== PvP подписки ======== */
  useEffect(() => {
    function onMatchFound({ roomId }) {
      setIsQueueing(false);
      setCurrentRoom(roomId);
      setPvpMode(true);
      socket.emit("ready", { roomId });
      setScreen("game");
    }
    function onState({ roomId, you, opp, deadline, stake }) {
      if (currentRoom && roomId !== currentRoom) return;
      setStakeOnServer(stake ?? stakeOnServer);
      setPlayer(you.hand);
      setDealer(opp.hand);
      setOppScore(opp.score);
      setYouStood(!!you.stood);
      setOppStood(!!opp.stood);

      // раскрываем карты оппонента только после того, как оба закончили
      const reveal = (!!you.stood && !!opp.stood);
      setRevealed(reveal);

      setTurn(reveal ? "end" : (you.stood ? "dealer" : "player"));
      setDeadlineMs(deadline || null);
    }
    function onResult({ roomId, you, opp, result }) {
      if (currentRoom && roomId !== currentRoom) return;

      setRoundResult(result);
      setTurn("end");
      setYouStood(true);
      setOppStood(true);
      setPvpSecondsLeft(0);
      setRevealed(true);

      const item: UIHistoryItem = {
        id: newRoundId(),
        when: new Date().toLocaleString(),
        bet: stakeOnServer,
        result,
        you,
        opp,
      };
      setHistory((h) => [item, ...h].slice(0, 50));

      refreshBalance();
      loadLeaderboard().catch(() => {});
    }

    socket.on("match-found", onMatchFound);
    socket.on("state", onState);
    socket.on("result", onResult);

    return () => {
      socket.off("match-found", onMatchFound);
      socket.off("state", onState);
      socket.off("result", onResult);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoom, stakeOnServer]);

  useEffect(() => {
    if (!pvpMode || !deadlineMs) { setPvpSecondsLeft(null); return; }
    const tick = () => { setPvpSecondsLeft(Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000))); };
    tick();
    const t = setInterval(tick, 300);
    return () => clearInterval(t);
  }, [pvpMode, deadlineMs]);

  /* ======== Helpers ======== */
  function resetGameState() {
    setPlayer([]); setDealer([]); setDeck(createDeck());
    setTurn("player"); setRevealed(false); setRoundResult(null);
    setStakeOnServer(0); setRoundId(null);

    setCurrentRoom(null); setPvpMode(false); setIsQueueing(false);
    setOppScore(null); setYouStood(false); setOppStood(false); setDeadlineMs(null); setPvpSecondsLeft(null);
  }
  function goMenu() { resetGameState(); setScreen("menu"); setSecondsLeft(null); }
  function startRoundFromDeck(useExistingDeck: boolean) {
    const d = useExistingDeck ? [...deck] : createDeck();
    const p = [d.pop()!, d.pop()!];
    const o = [d.pop()!, d.pop()!];
    setDeck(d); setPlayer(p); setDealer(o);
    setTurn("player"); setRevealed(false); setRoundResult(null);
  }

  /* ======== Bet flow ======== */
  function openBetStage() { setSecondsLeft(BET_SECONDS); setScreen("bet"); }
  useEffect(() => {
    if (screen !== "bet" || secondsLeft == null) return;
    if (secondsLeft <= 0) { goMenu(); return; }
    const t = setTimeout(() => setSecondsLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [screen, secondsLeft]);

  async function confirmBetAndStart() {
    if (bet > balance) { alert("Недостаточно средств для ставки"); return; }
    const rId = newRoundId();
    try {
      const res = await apiBet(userId, bet, rId);
      if (!res.success) { alert(res.message || "Не удалось сделать ставку"); return; }
      setBalance(res.balance);
      setRoundId(rId);
      setStakeOnServer(bet);

      setIsQueueing(true);
      setPvpMode(true);
      socket.emit("queue", { stake: bet });
      setScreen("menu");
      setSecondsLeft(null);
    } catch (e: any) { alert(e?.message || "Ошибка /bet"); }
  }

  /* ======== Menu actions ======== */
  function onPlay() { openBetStage(); }
  function makeLobby() {
    const lobbyCode = Math.random().toString(36).slice(2, 8);
    const url = `${window.location.origin}/?lobby=${lobbyCode}`;
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(url); alert(`Ссылка лобби скопирована!\n${url}`); }
    else { prompt("Скопируй ссылку:", url); }
  }
  function onPlayWithFriend() { makeLobby(); }

  /* ======== Game controls ======== */
  function backFromGame() { goMenu(); }
  function hit() {
    if (pvpMode && currentRoom) { if (!youStood) socket.emit("move", { roomId: currentRoom, action: "hit" }); return; }
    if (turn !== "player") return;
    const d = [...deck], c = d.pop(); if (!c) return;
    const next = [...player, c]; setDeck(d); setPlayer(next);
    if (handValue(next) > 21) { setTurn("dealer"); }
  }
  function stand() {
    if (pvpMode && currentRoom) { if (!youStood) socket.emit("move", { roomId: currentRoom, action: "stand" }); return; }
    if (turn !== "player") return; setTurn("dealer");
  }

  useEffect(() => {
    if (pvpMode) return;
    if (turn !== "dealer") return;
    const t = setTimeout(() => {
      setRevealed(true);
      let d = [...dealer], dd = [...deck];
      while (handValue(d) < 17) { const c = dd.pop(); if (!c) break; d.push(c); }
      setDealer(d); setDeck(dd); setTurn("end");
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, pvpMode]);

  useEffect(() => {
    if (pvpMode) return;
    if (turn !== "end" || !roundId) return;

    (async () => {
      const p = pVal, o = dVal;
      let res: Exclude<Result, null> = "push";
      if (p > 21 && o > 21) res = "push";
      else if (p > 21) res = "lose";
      else if (o > 21) res = "win";
      else if (p > o) res = "win";
      else if (p < o) res = "lose";

      try {
        if (res === "win") {
          const r = await apiWin(userId, PAYOUT.win(stakeOnServer), roundId);
          if (r.success) setBalance(r.balance);
        } else if (res === "push") {
          const r = await apiWin(userId, PAYOUT.push(stakeOnServer), roundId);
          if (r.success) setBalance(r.balance);
        }
      } catch {}

      const id = newRoundId();
      const item: UIHistoryItem = { id, when: new Date().toLocaleString(), bet: stakeOnServer, result: res, you: p, opp: o };
      setHistory((h) => [item, ...h].slice(0, 50));

      setRoundResult(res); setRoundId(null); setStakeOnServer(0);
      refreshBalance(); loadLeaderboard().catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, pvpMode]);

  function nextRound() { openBetStage(); }

  /* =================== Screens =================== */

  const MenuScreen = (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-wide">21 • 1 на 1</h1>
          <p className="text-white/60 text-sm mt-1">Минимализм • чёрный + синий</p>
        </div>
        <Pill>Баланс: {balance}</Pill>
      </div>

      <LiveTicker />

      {isQueueing && (
        <div className="mt-3 p-3 rounded-2xl border border-white/10 bg-white/5 text-white/80">
          Идёт подбор соперника для ставки {bet}…
        </div>
      )}

      <div className="grid gap-3 mt-4">
        <Button size="lg" onClick={onPlay} className="w-full">
          <div className="flex items-center justify-center gap-2">
            <Gamepad2 size={20} />
            Играть
          </div>
        </Button>
        <Button size="lg" onClick={onPlayWithFriend} className="w-full">
          <div className="flex items-center justify-center gap-2">
            <Users2 size={20} />
            Играть с другом
          </div>
        </Button>
        <Button size="lg" onClick={() => setScreen("durak")} className="w-full">
          <div className="flex items-center justify-center gap-2">
            <span className="font-semibold">🃏</span>
            Дурак
          </div>
        </Button>
      </div>

      <div className="mt-6 p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <h3 className="text-white/90 font-semibold">Правила (кратко)</h3>
        <p className="text-white/60 text-sm mt-2 leading-relaxed">
          Цель — сумма ближе к 21, не перебрав. Туз = 1 или 11. В PvP у оппонента видна только сумма до конца раунда.
        </p>
      </div>

      <ShuffleDeck />
    </div>
  );

  const progress = secondsLeft == null ? 1 : secondsLeft / BET_SECONDS;
  const CIRC = 34 * Math.PI;

  const BetScreen = (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={goMenu} className="h-9 px-3">Назад</Button>
        <Pill>Баланс: {balance}</Pill>
      </div>

      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h3 className="text-white/90 font-semibold">Выбери ставку</h3>
          <div className="relative w-10 h-10">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,.2)" strokeWidth="4" fill="none" />
              <circle
                cx="20" cy="20" r="17" stroke={BLUE} strokeWidth="4" fill="none" strokeLinecap="round"
                strokeDasharray={`${CIRC}`} strokeDashoffset={`${CIRC * (1 - progress)}`}
                style={{ transition: "stroke-dashoffset 300ms linear" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-white text-xs">{secondsLeft ?? ""}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[10, 25, 50, 100, 250, 500].map((v) => (
            <Button key={v} size="md" active={bet === v} onClick={() => setBet(v)} disabled={v > balance}>{v}</Button>
          ))}
        </div>
        <Button size="lg" className="w-full mt-4" onClick={confirmBetAndStart} disabled={bet > balance}>
          Подтвердить ставку
        </Button>
        {bet > balance && <div className="text-rose-300 text-sm mt-2">Недостаточно средств</div>}
      </div>
    </div>
  );

  const GameScreen = (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <Button onClick={backFromGame} className="h-9 px-3">Назад</Button>
        <Pill>Баланс: {balance}</Pill>
      </div>

      {/* Opponent */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm">Оппонент</span>
          <span className="text-white/70 text-sm">{pvpMode ? (oppScore ?? "?") : (revealed || turn !== "dealer" ? dVal : "?")}</span>
        </div>
        <div className="flex gap-2 mt-2">
          {!pvpMode ? (
            dealer.map((c, i) => (
              <CardView key={i} c={c} hidden={i === 0 && !revealed && turn !== "end" && turn !== "dealer"} />
            ))
          ) : (youStood && oppStood) ? (
            dealer.map((c, i) => <CardView key={i} c={c} />)
          ) : (
            Array.from({ length: dealer.length }).map((_, i) => (
              <CardView key={i} c={{ rank: "A", suit: "♠" } as Card} hidden />
            ))
          )}
        </div>
      </div>

      {/* Player */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <span className="text-white/90 font-medium">Ты</span>
          <span className="text-white/90 font-medium">{pVal}</span>
        </div>
        <div className="flex gap-2 mt-2">
          {player.map((c, i) => <CardView key={i} c={c} />)}
        </div>
      </div>

      {/* PvP timer */}
      {pvpMode && pvpSecondsLeft != null && (
        <div className="mt-4 text-white/70 text-sm">
          Ход: {youStood ? "оппонента" : "твой"} • осталось {pvpSecondsLeft}s
        </div>
      )}

      {/* Controls */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        {turn === "player" || (pvpMode && !youStood && turn !== "end") ? (
          <>
            <Button size="lg" onClick={hit} className="w-full" disabled={pvpMode && youStood}>Взять</Button>
            <Button size="lg" onClick={stand} className="w-full" disabled={pvpMode && youStood}>Стоп</Button>
          </>
        ) : turn === "end" || (pvpMode && youStood && oppStood) ? (
          <Button size="lg" onClick={nextRound} className="col-span-2 w-full">Следующий раунд</Button>
        ) : (
          <Button disabled size="lg" className="col-span-2 w-full">Ход оппонента…</Button>
        )}
      </div>

      {/* Result info */}
      {roundResult && (
        <div
          className={cn(
            "fixed left-1/2 -translate-x-1/2 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40",
            "px-4 py-3 rounded-2xl border backdrop-blur-md",
            roundResult === "win"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
              : roundResult === "lose"
              ? "bg-rose-500/15 border-rose-500/30 text-rose-200"
              : "bg-white/10 border-white/20 text-white/80"
          )}
        >
          <div className="flex items-center gap-2">
            <Info size={18} />
            {roundResult === "win" && <span>Победа! +{PAYOUT.win(stakeOnServer)}</span>}
            {roundResult === "lose" && <span>Поражение…</span>}
            {roundResult === "push" && <span>Ничья. +{PAYOUT.push(stakeOnServer)}</span>}
          </div>
        </div>
      )}
    </div>
  );

  const LeaderboardScreen = (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Crown size={18} /> Таблица лидеров
        </h2>
        <div className="flex gap-2">
          <Button size="sm" active={lbMetric === "wins"} onClick={() => { setLbMetric("wins"); loadLeaderboard("wins"); }}>
            ТОП по победам
          </Button>
          <Button size="sm" active={lbMetric === "profit"} onClick={() => { setLbMetric("profit"); loadLeaderboard("profit"); }}>
            По профиту
          </Button>
        </div>
      </div>

      {!leaders && <div className="text-white/60">Загрузка…</div>}
      {leaders && leaders.length === 0 && <div className="text-white/60">Пока пусто — сыграй несколько раундов.</div>}
      {leaders && leaders.length > 0 && (
        <div className="space-y-2">
          {leaders.map((u) => (
            <div key={u.userId} className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl border border-white/10 bg-gradient-to-br from-[#1e293b] to-[#0b1220] grid place-items-center text-white/80">
                  {(u.userId.match(/[a-z0-9]/i)?.[0] || "U").toUpperCase()}
                </div>
                <div className="text-white truncate max-w-[160px]">{u.userId}</div>
              </div>
              <div className="text-white/80">{lbMetric === "wins" ? `${u.wins} побед` : `${u.profit > 0 ? "+" : ""}${u.profit}`}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const ProfileScreen = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2"><User2 size={18} /> Профиль</h2>
        <Pill>Баланс: {balance}</Pill>
      </div>

      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <div className="text-white/90 font-medium mb-2">Тестовое пополнение</div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={async () => {
            try { const r = await topup(userId, 1000); setBalance(r.balance); alert("Баланс пополнен на +1000"); loadLeaderboard().catch(()=>{}); }
            catch { setBalance((b) => b + 1000); alert("Бэкенд недоступен. Временное локальное +1000 для демонстрации."); }
          }}>+1000 (тест)</Button>
        </div>
        <div className="text-white/50 text-xs mt-2">* Если сервер недоступен, прибавление только в интерфейсе.</div>
      </div>

      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <div className="text-white/90 font-medium mb-2">История (локальная)</div>
        <div className="mt-3 space-y-2 max-h-60 overflow-auto pr-1">
          {history.length === 0 && (
            <div className="text-white/60 text-sm flex items-center gap-3 p-3 border border-white/10 rounded-2xl bg-[#0f1723]">
              История пуста — сыграй первый раунд.
            </div>
          )}
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-[#0f1723]">
              <div className="text-white/80 text-sm">{h.when}</div>
              <div className="text-white text-sm">{h.result === "win" ? "+" : h.result === "lose" ? "-" : "±"}{h.bet}</div>
              <div className="text-white/60 text-sm">
                {Number.isFinite(h.you) && Number.isFinite(h.opp) ? (<>Ты {h.you} • Опп {h.opp}</>) : (<>Результат: {h.result}</>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const PartnersScreen = (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold text-white">Партнёры</h2>
      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md space-y-3">
        <div className="text-white/80 text-sm">Делись ссылкой и получай <b>5%</b> от каждого пополнения друга.</div>
        <div className="text-white/70 text-xs break-all p-3 rounded-xl bg-[#0f1723] border border-white/10">{refLink || "—"}</div>
        <div className="flex gap-2">
          <Button onClick={() => { if (refLink) navigator.clipboard.writeText(refLink); }}>Скопировать</Button>
          <Button onClick={async () => {
            const r = prompt("Тест: пополнить на сумму (например 200)"); if (!r) return;
            const n = Number(r); if (!Number.isFinite(n) || n <= 0) return;
            try { const t = await topup(userId, n); setBalance(t.balance); alert(`Баланс пополнен на ${n}`); loadLeaderboard().catch(()=>{}); }
            catch { setBalance((b) => b + n); alert("Бэкенд недоступен. Временное локальное пополнение."); }
          }}>Тестовое пополнение</Button>
        </div>
        <div className="text-white/50 text-xs">* Для продакшена подключим реальные платежи и автоначисление 5%.</div>
      </div>
    </div>
  );

  return (
    <div
      className={cn("min-h-screen w-full", bg)}
      style={{
        backgroundImage: `radial-gradient(800px 400px at 50% -150px, rgba(33,118,255,0.18), rgba(10,15,20,0)),
                          radial-gradient(600px 300px at 20% 120%, rgba(33,118,255,0.15), rgba(10,15,20,0))`,
      }}
    >
      <div className="max-w-md mx-auto h-[100dvh] flex flex-col">
        {/* Top Bar */}
        <div className={cn("px-4 pt-4 pb-3 sticky top-0 z-10 border-b border-white/10", bg, "bg-opacity-80 backdrop-blur-md")}>
          <div className="flex items-center justify-between">
            <div className="text-white/80 text-sm tracking-wide">21 · 1 на 1</div>
            <div className="text-white font-semibold">Баланс: {balance}</div>
          </div>
        </div>

        {/* Content */}
        <div className={cn("flex-1 overflow-auto px-2", screen === "game" || screen === "bet" ? "pb-8" : "pb-[calc(96px+env(safe-area-inset-bottom))]")}>
          <div className="mx-2">
            {screen === "menu" && MenuScreen}
            {screen === "bet" && BetScreen}
            {screen === "game" && GameScreen}
            {screen === "leaderboard" && LeaderboardScreen}
            {screen === "profile" && ProfileScreen}
            {screen === "partners" && PartnersScreen}
            {screen === "durak" && (
              <DurakScreen
                userId={userId}
                balance={balance}
                setBalance={(n)=>setBalance(n)}
                goBack={()=>setScreen("menu")}
              />
            )}
          </div>
        </div>

        {/* Bottom Nav */}
        {screen !== "game" && screen !== "bet" && (
          <nav className={cn("fixed bottom-0 left-0 right-0 z-50 border-t border-white/10", bg, "bg-opacity-80 backdrop-blur-md")}
               style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}>
            <div className="max-w-md mx-auto grid grid-cols-4 gap-2 p-2">
              <NavButton label="Меню" icon={<Gamepad2 size={18} />} active={screen === "menu"} onClick={() => setScreen("menu")} />
              <NavButton label="Лидеры" icon={<Crown size={18} />} active={screen === "leaderboard"} onClick={() => setScreen("leaderboard")} />
              <NavButton label="Профиль" icon={<User2 size={18} />} active={screen === "profile"} onClick={() => setScreen("profile")} />
              <NavButton label="Партнёры" icon={<span className="font-semibold">₽</span>} active={screen === "partners"} onClick={() => setScreen("partners")} />
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

/* =================== Nav Button =================== */
function NavButton({
  label, icon, active, onClick,
}: { label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void; }) {
  const cnx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
  return (
    <button
      onClick={onClick}
      className={cnx(
        "h-12 rounded-2xl flex items-center justify-center gap-2 border text-sm transition-colors",
        "border-white/10 text-white bg-white/5 hover:bg-white/10 backdrop-blur-md shadow-[0_10px_40px_-20px_rgba(0,0,0,.6)]",
        active && "bg-neutral-700 ring-2 ring-[#2176ff]/40"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
