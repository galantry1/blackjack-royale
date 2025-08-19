import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crown, User2, Gamepad2, Users2, Info } from "lucide-react";

// ==== API (наш бэкенд) ====
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
  getTelegramUser,
} from "./lib/api";

// ==== Realtime (Socket.IO) ====
import { io, Socket } from "socket.io-client";

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
type Screen = "menu" | "bet" | "game" | "leaderboard" | "profile" | "partners";
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

// берём id из Telegram, иначе постоянный guest_<uuid> в localStorage
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

// выплаты
const PAYOUT = {
  win: (stake: number) => Math.floor(stake * 1.9), // комиссия 10%
  push: (stake: number) => stake, // возврат ставки
};

// helper для PvP: "AS" -> {rank:"A", suit:"♠"}
function fromCodeToCard(code: string): Card {
  const rank = code.replace(/[SHDC]$/, "") as Card["rank"];
  const s = code.slice(-1);
  const suit = (s === "S" ? "♠" : s === "H" ? "♥" : s === "D" ? "♦" : "♣") as Card["suit"];
  return { rank, suit };
}

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

/* ============ Live Ticker (полоса пополнений) ============ */
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

  // баланс только с бэка
  const [balance, setBalance] = useState<number>(0);

  // локальная история только для UI
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

  // game state (универсальные; SOLO/PvP)
  const [deck, setDeck] = useState(createDeck());
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [turn, setTurn] = useState<Turn>("player"); // SOLO использует; PvP — игнор
  const [revealed, setRevealed] = useState(false);
  const [roundResult, setRoundResult] = useState<Result>(null);

  // SOLO: текущий roundId и stake на сервере
  const [roundId, setRoundId] = useState<string | null>(null);
  const [stakeOnServer, setStakeOnServer] = useState<number>(0);

  // leaderboard
  const [leaders, setLeaders] = useState<LeaderboardRow[] | null>(null);
  const [lbMetric, setLbMetric] = useState<"wins" | "profit">("wins");

  // partners
  const [refLink, setRefLink] = useState<string>("");

  // ====== PvP realtime ======
  const socketRef = useRef<Socket | null>(null);
  const [queued, setQueued] = useState(false); // для экрана ставки
  const [pvpRoom, setPvpRoom] = useState<{ roomId: string; roundId?: string; stake?: number } | null>(null);
  const [pvpStood, setPvpStood] = useState<Record<string, boolean>>({});
  const [deadline, setDeadline] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  const isPvP = !!pvpRoom;

  // таймер тикает локально для обратного отсчёта
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // bet countdown (из старого UX) — теперь не используем авто-лкбби, только для анимации круга, если хочется
  const BET_SECONDS = 10;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const pVal = useMemo(() => handValue(player), [player]);
  const dVal = useMemo(() => handValue(dealer), [dealer]);

  /* ======== Persistence (save history only) ======== */
  useEffect(() => {
    try {
      localStorage.setItem("history_v1", JSON.stringify(history));
    } catch {}
  }, [history]);

  /* ======== Init from backend ======== */
  useEffect(() => {
    const id = uid();
    setUserId(id);
    (async () => {
      try {
        // отправляем профиль в /init (для имён в лидерборде)
        const tg = getTelegramUser();
        await initUser({
          userId: id,
          username: tg?.username ?? null,
          first_name: tg?.first_name ?? null,
          last_name: tg?.last_name ?? null,
          displayName: tg?.displayName ?? null,
        });

        const b = await apiGetBalance(id);
        setBalance(b.balance);
      } catch (e) {
        console.error(e);
      }
    })();

    // если пришли по реф-ссылке ?ref=CODE — привязываем (без жёстких ошибок)
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref) applyRef(id, ref).catch(() => {});

    // лидерборд
    loadLeaderboard("wins").catch(() => {});

    // партнёрская ссылка
    getRefLink(id)
      .then((r) => setRefLink(r.web || r.telegram))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshBalance() {
    try {
      const b = await apiGetBalance(userId);
      setBalance(b.balance);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadLeaderboard(metric: "wins" | "profit" = lbMetric) {
    try {
      const d = await getLeaderboard(metric, 20);
      setLeaders(d.entries);
    } catch (e) {
      console.error(e);
      setLeaders([]);
    }
  }

  /* ======== Realtime: socket lifecycle ======== */
  useEffect(() => {
    if (!userId) return;

    const base =
      (import.meta as any)?.env?.VITE_WS_URL?.trim?.() ||
      (location.hostname === "localhost"
        ? "http://localhost:3001"
        : new URL((import.meta as any)?.env?.VITE_API_URL ?? "https://blackjack-royale-backend.onrender.com").origin);

    const s: Socket = io(base, { transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.emit("hello", { userId });

    s.on("queued", ({ stake }) => {
      setQueued(true);
    });
    s.on("queue_canceled", () => {
      setQueued(false);
    });

    // матч найден -> сервер сразу раздаёт и пошлёт pvp_state; экран игры включим здесь
    s.on("match_found", ({ roomId, players, stake }) => {
      setQueued(false);
      setPvpRoom({ roomId, stake });
      alert(`Матч найден!\nКомната: ${roomId}\nИгроки: ${players.join(" vs ")}`);
      setScreen("game");
    });

    // сервер присылает полное состояние раунда
    s.on("pvp_state", ({ roomId, roundId, hands, sums, stood, deadline: dl, stake }) => {
      setPvpRoom({ roomId, roundId, stake });
      setPvpStood(stood || {});
      setDeadline(dl || {});
      setRevealed(true);
      setRoundResult(null);

      // маппим руки на наш UI (ты/оппонент)
      const myId = userId;
      const oppId = Object.keys(hands).find((u) => u !== myId) || myId;

      setPlayer((hands[myId] || []).map(fromCodeToCard));
      setDealer((hands[oppId] || []).map(fromCodeToCard));
      // turn больше не нужен — ходы параллельно; для совместимости пусть будет "player"
      setTurn("player");
    });

    s.on("pvp_end", ({ result, sums }) => {
      // показываем результат для текущего игрока
      const r = (result?.[userId] || "push") as Exclude<Result, null>;
      setRoundResult(r);

      // локальная UI-история
      const item: UIHistoryItem = {
        id: newRoundId(),
        when: new Date().toLocaleString(),
        bet: pvpRoom?.stake ?? bet,
        result: r,
        you: sums?.[userId],
        opp: Object.entries(sums || {}).find(([k]) => k !== userId)?.[1] as number | undefined,
      };
      setHistory((h) => [item, ...h].slice(0, 50));

      refreshBalance();
      loadLeaderboard().catch(() => {});
    });

    s.on("error_msg", (m: any) => alert(m?.message || "Ошибка матчмейкинга"));

    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* ======== Helpers ======== */
  function resetGameState() {
    setPlayer([]);
    setDealer([]);
    setDeck(createDeck());
    setTurn("player");
    setRevealed(false);
    setRoundResult(null);
    setStakeOnServer(0);
    setRoundId(null);
  }
  function goMenu() {
    resetGameState();
    setScreen("menu");
    setSecondsLeft(null);
    setQueued(false);
    setPvpRoom(null);
    setPvpStood({});
    setDeadline({});
  }
  function startRoundFromDeck(useExistingDeck: boolean) { // SOLO
    const d = useExistingDeck ? [...deck] : createDeck();
    const p = [d.pop()!, d.pop()!];
    const o = [d.pop()!, d.pop()!];
    setDeck(d);
    setPlayer(p);
    setDealer(o);
    setTurn("player");
    setRevealed(false);
    setRoundResult(null);
  }

  /* ======== Flow: сначала ставка, потом подбор ======== */
  function onPlay() {
    // Теперь "Играть" открывает экран ставки (как просил)
    setSecondsLeft(null);
    setScreen("bet");
  }
  function makeLobby() {
    const lobbyCode = Math.random().toString(36).slice(2, 8);
    const url = `${window.location.origin}/?lobby=${lobbyCode}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
      alert(`Ссылка лобби скопирована!\n${url}`);
    } else {
      prompt("Скопируй ссылку:", url);
    }
  }
  function onPlayWithFriend() {
    makeLobby();
  }

  async function confirmBetAndStart() {
    if (bet > balance) {
      alert("Недостаточно средств для ставки");
      return;
    }

    // PvP: запуск подбора по ставке
    if (socketRef.current) {
      setQueued(true);
      socketRef.current.emit("join_queue", { stake: bet });
      return; // ждём match_found/pvp_state от сервера
    }

    // SOLO (fallback на случай отсутствия сокета) — твой старый флоу
    const rId = newRoundId();
    try {
      const res = await apiBet(userId, bet, rId);
      if (!res.success) {
        alert(res.message || "Не удалось сделать ставку");
        return;
      }
      setBalance(res.balance);
      setRoundId(rId);
      setStakeOnServer(bet);

      startRoundFromDeck(false);
      setScreen("game");
      setSecondsLeft(null);
    } catch (e: any) {
      alert(e?.message || "Ошибка /bet");
    }
  }

  /* ======== Game controls ======== */
  function hit() {
    // PvP — действие идёт на сервер; он уже запрещает брать после перебора/стоя
    if (isPvP && pvpRoom) {
      socketRef.current?.emit("pvp_action", { roomId: pvpRoom.roomId, action: "hit" });
      return;
    }
    // SOLO:
    if (turn !== "player") return;
    const d = [...deck];
    const c = d.pop();
    if (!c) return;
    const next = [...player, c];
    setDeck(d);
    setPlayer(next);

    if (handValue(next) > 21) {
      setTurn("dealer");
    }
  }
  function stand() {
    if (isPvP && pvpRoom) {
      socketRef.current?.emit("pvp_action", { roomId: pvpRoom.roomId, action: "stand" });
      return;
    }
    if (turn !== "player") return;
    setTurn("dealer");
  }

  // dealer auto play (только SOLO; в PvP управляет сервер)
  useEffect(() => {
    if (isPvP) return;
    if (turn !== "dealer") return;
    const t = setTimeout(() => {
      setRevealed(true);
      let d = [...dealer];
      let dd = [...deck];
      while (handValue(d) < 17) {
        const c = dd.pop();
        if (!c) break;
        d.push(c);
      }
      setDealer(d);
      setDeck(dd);
      setTurn("end");
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, isPvP]);

  // end of round SOLO -> начисления на сервере + локальная история
  useEffect(() => {
    if (isPvP) return; // PvP делает сервер
    if (turn !== "end" || !roundId) return;

    (async () => {
      const p = pVal;
      const o = dVal;

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
      } catch (e) {
        console.error("settle error:", e);
      }

      // локальная UI-история
      const id = newRoundId();
      const item: UIHistoryItem = {
        id,
        when: new Date().toLocaleString(),
        bet: stakeOnServer,
        result: res,
        you: p,
        opp: o,
      };
      setHistory((h) => [item, ...h].slice(0, 50));

      setRoundResult(res);
      setRoundId(null);
      setStakeOnServer(0);

      // обновим баланс и лидерборд
      refreshBalance();
      loadLeaderboard().catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, isPvP]);

  function nextRound() {
    // для SOLO оставим старый флоу
    setScreen("bet");
    setQueued(false);
    setPvpRoom(null);
    setPvpStood({});
    setDeadline({});
  }

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
      </div>

      <div className="mt-6 p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <h3 className="text-white/90 font-semibold">Правила (кратко)</h3>
        <p className="text-white/60 text-sm mt-2 leading-relaxed">
          Цель — сумма ближе к 21, не перебрав. Туз = 1 или 11. В PvP ходят оба параллельно, на действие 30 секунд.
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
        <Button onClick={goMenu} className="h-9 px-3">
          Назад
        </Button>
        <Pill>Баланс: {balance}</Pill>
      </div>

      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h3 className="text-white/90 font-semibold">Выбери ставку</h3>
          {/* Оставили твой индикатор (не критично) */}
          <div className="relative w-10 h-10">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="17" stroke="rgba(255,255,255,.2)" strokeWidth="4" fill="none" />
              <circle
                cx="20"
                cy="20"
                r="17"
                stroke={BLUE}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRC}`}
                strokeDashoffset={`${CIRC * (1 - progress)}`}
                style={{ transition: "stroke-dashoffset 300ms linear" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-white text-xs">
              {secondsLeft ?? ""}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[10, 25, 50, 100, 250, 500].map((v) => (
            <Button key={v} size="md" active={bet === v} onClick={() => setBet(v)} disabled={v > balance}>
              {v}
            </Button>
          ))}
        </div>
        <Button
          size="lg"
          className="w-full mt-4"
          onClick={confirmBetAndStart}
          disabled={bet > balance}
        >
          Подтвердить и найти соперника
        </Button>
        {bet > balance && <div className="text-rose-300 text-sm mt-2">Недостаточно средств</div>}

        {queued && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80">
            <span>Поиск соперника на ставку {bet}…</span>
            <Button
              size="sm"
              onClick={() => socketRef.current?.emit("cancel_queue", { stake: bet })}
            >
              Отменить
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // секунды до дедлайна от сервера
  const myLeftMs = Math.max(0, (deadline[userId] || 0) - now);
  const oppId = Object.keys(pvpStood).find((u) => u !== userId);
  const oppLeftMs = Math.max(0, (oppId ? deadline[oppId] : 0) || 0 - now);

  const GameScreen = (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <Button onClick={goMenu} className="h-9 px-3">
          Назад
        </Button>
        <Pill>Баланс: {balance}</Pill>
      </div>

      {/* Opponent */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-sm">
            Оппонент {isPvP && pvpRoom?.stake ? `• ставка ${pvpRoom.stake}` : ""}
          </span>
          {isPvP && <span className="text-white/70 text-sm">{Math.ceil(oppLeftMs / 1000)}с</span>}
        </div>
        <div className="flex gap-2 mt-2">
          {dealer.map((c, i) => (
            <CardView key={i} c={c} />
          ))}
        </div>
      </div>

      {/* Player */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <span className="text-white/90 font-medium">Ты</span>
          {isPvP && <span className="text-white/90 font-medium">{Math.ceil(myLeftMs / 1000)}с</span>}
        </div>
        <div className="flex gap-2 mt-2">
          {player.map((c, i) => (
            <CardView key={i} c={c} />
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <Button
          size="lg"
          onClick={hit}
          className="w-full"
          disabled={
            isPvP
              ? pvpStood[userId] || pVal > 21 // сервер всё равно проверит, но в UI блокируем
              : turn !== "player"
          }
        >
          Взять
        </Button>
        <Button
          size="lg"
          onClick={stand}
          className="w-full"
          disabled={
            isPvP
              ? pvpStood[userId] // уже нажал Стоп/перебрал
              : turn !== "player"
          }
        >
          Стоп
        </Button>
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
            {roundResult === "win" && <span>Победа!</span>}
            {roundResult === "lose" && <span>Поражение…</span>}
            {roundResult === "push" && <span>Ничья</span>}
          </div>
        </div>
      )}

      {/* SOLO — кнопка следующего раунда */}
      {!isPvP && turn === "end" && (
        <div className="mt-6">
          <Button size="lg" onClick={nextRound} className="w-full">
            Следующий раунд
          </Button>
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
          <Button
            size="sm"
            active={lbMetric === "wins"}
            onClick={() => {
              setLbMetric("wins");
              loadLeaderboard("wins");
            }}
          >
            ТОП по победам
          </Button>
          <Button
            size="sm"
            active={lbMetric === "profit"}
            onClick={() => {
              setLbMetric("profit");
              loadLeaderboard("profit");
            }}
          >
            По профиту
          </Button>
        </div>
      </div>

      {!leaders && <div className="text-white/60">Загрузка…</div>}
      {leaders && leaders.length === 0 && (
        <div className="text-white/60">Пока пусто — сыграй несколько раундов.</div>
      )}
      {leaders && leaders.length > 0 && (
        <div className="space-y-2">
          {leaders.map((u) => (
            <div
              key={u.userId}
              className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl border border-white/10 bg-gradient-to-br from-[#1e293b] to-[#0b1220] grid place-items-center text-white/80">
                  {(u.name || u.userId).charAt(0).toUpperCase()}
                </div>
                <div className="text-white truncate max-w-[160px]">{u.name ?? u.userId}</div>
              </div>
              <div className="text-white/80">
                {lbMetric === "wins" ? `${u.wins} побед` : `${u.profit > 0 ? "+" : ""}${u.profit}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const ProfileScreen = (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <User2 size={18} /> Профиль
        </h2>
        <Pill>Баланс: {balance}</Pill>
      </div>

      {/* Тестовое пополнение (+1000) с фоллбэком */}
      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
        <div className="text-white/90 font-medium mb-2">Тестовое пополнение</div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={async () => {
              try {
                const r = await topup(userId, 1000);
                setBalance(r.balance);
                alert("Баланс пополнен на +1000");
                loadLeaderboard().catch(() => {});
              } catch {
                setBalance((b) => b + 1000);
                alert("Бэкенд недоступен. Временное локальное +1000 для демонстрации.");
              }
            }}
          >
            +1000 (тест)
          </Button>
        </div>
        <div className="text-white/50 text-xs mt-2">
          * Если сервер недоступен, прибавление только в интерфейсе (для быстрых тестов).
        </div>
      </div>

      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blур-md">
        <div className="text-white/90 font-medium mb-2">История (локальная)</div>
        <div className="mt-3 space-y-2 max-h-60 overflow-auto pr-1">
          {history.length === 0 && (
            <div className="text-white/60 text-sm flex items-center gap-3 p-3 border border-white/10 rounded-2xl bg-[#0f1723]">
              История пуста — сыграй первый раунд.
            </div>
          )}
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-[#0f1723]"
            >
              <div className="text-white/80 text-sm">{h.when}</div>
              <div className="text-white text-sm">
                {h.result === "win" ? "+" : h.result === "lose" ? "-" : "±"}
                {h.bet}
              </div>
              <div className="text-white/60 text-sm">
                {Number.isFinite(h.you) && Number.isFinite(h.opp) ? (
                  <>Ты {h.you} • Опп {h.opp}</>
                ) : (
                  <>Результат: {h.result}</>
                )}
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
        <div className="text-white/80 text-sm">
          Делись ссылкой и получай <b>5%</b> от каждого пополнения друга.
        </div>
        <div className="text-white/70 text-xs break-all p-3 rounded-xl bg-[#0f1723] border border-white/10">
          {refLink || "—"}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (refLink) navigator.clipboard.writeText(refLink);
            }}
          >
            Скопировать
          </Button>
          <Button
            onClick={async () => {
              const r = prompt("Тест: пополнить на сумму (например 200)");
              if (!r) return;
              const n = Number(r);
              if (!Number.isFinite(n) || n <= 0) return;
              try {
                const t = await topup(userId, n);
                setBalance(t.balance);
                alert(`Баланс пополнен на ${n}`);
                loadLeaderboard().catch(() => {});
              } catch {
                setBalance((b) => b + n);
                alert("Бэкенд недоступен. Временное локальное пополнение для демонстрации.");
              }
            }}
          >
            Тестовое пополнение
          </Button>
        </div>
        <div className="text-white/50 text-xs">
          * Для продакшена подключим реальные платежи и автоначисление 5%.
        </div>
      </div>
    </div>
  );

  /* =================== Root Layout =================== */
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
        <div
          className={cn(
            "px-4 pt-4 pb-3 sticky top-0 z-10 border-b border-white/10",
            bg,
            "bg-opacity-80 backdrop-blur-md"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="text-white/80 text-sm tracking-wide">21 · 1 на 1</div>
            <div className="text-white font-semibold">Баланс: {balance}</div>
          </div>
        </div>

        {/* Content */}
        <div
          className={cn(
            "flex-1 overflow-auto px-2",
            screen === "game" || screen === "bet" ? "pb-8" : "pb-[calc(96px+env(safe-area-inset-bottom))]"
          )}
        >
          <div className="mx-2">
            {screen === "menu" && MenuScreen}
            {screen === "bet" && BetScreen}
            {screen === "game" && GameScreen}
            {screen === "leaderboard" && LeaderboardScreen}
            {screen === "profile" && ProfileScreen}
            {screen === "partners" && PartnersScreen}
          </div>
        </div>

        {/* Bottom Nav (4 вкладки) — скрыт на ставке и в игре */}
        {screen !== "game" && screen !== "bet" && (
          <nav
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50 border-t border-white/10",
              bg,
              "bg-opacity-80 backdrop-blur-md"
            )}
            style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
          >
            <div className="max-w-md mx-auto grid grid-cols-4 gap-2 p-2">
              <NavButton
                label="Меню"
                icon={<Gamepad2 size={18} />}
                active={screen === "menu"}
                onClick={() => setScreen("menu")}
              />
              <NavButton
                label="Лидеры"
                icon={<Crown size={18} />}
                active={screen === "leaderboard"}
                onClick={() => setScreen("leaderboard")}
              />
              <NavButton
                label="Профиль"
                icon={<User2 size={18} />}
                active={screen === "profile"}
                onClick={() => setScreen("profile")}
              />
              <NavButton
                label="Партнёры"
                icon={<span className="font-semibold">₽</span>}
                active={screen === "partners"}
                onClick={() => setScreen("partners")}
              />
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

/* =================== Nav Button =================== */
function NavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
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
