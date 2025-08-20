// src/screens/Durak.tsx
import React, { useEffect, useState } from "react";
import { socket } from "../lib/socket";
import { bet as apiBet } from "../lib/api";
import DurakSkin from "./DurakSkin";

type Card = { rank: string; suit: string };
type TablePair = { a: Card; d?: Card | null };
const cn = (...a:(string|false|undefined)[]) => a.filter(Boolean).join(" ");

export default function DurakScreen({
  userId, balance, setBalance, goBack,
}: { userId: string; balance: number; setBalance: (n:number)=>void; goBack: ()=>void; }) {
  const [step, setStep] = useState<"menu"|"lobbies"|"game">("menu");
  const [playersCount, setPlayersCount] = useState<number>(2);
  const [stake, setStake] = useState<number>(25);

  // лобби
  const [lobbies, setLobbies] = useState<any[]>([]);
  const [joining, setJoining] = useState<string|null>(null);
  const [disabledMode, setDisabledMode] = useState(false);

  // игра
  const [lobbyId, setLobbyId] = useState<string|null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [table, setTable] = useState<TablePair[]>([]);
  const [trump, setTrump] = useState<string>("♠");
  const [trumpCard, setTrumpCard] = useState<Card|null>(null);
  const [deckCount, setDeckCount] = useState<number>(0);
  const [discardCount, setDiscardCount] = useState<number>(0);
  const [attacker, setAttacker] = useState<string>("");
  const [defender, setDefender] = useState<string>("");
  const [players, setPlayers] = useState<{userId:string,handCount:number}[]>([]);

  const meIsAttacker = attacker===userId;
  const meIsDefender = defender===userId;
  const myTurn  = meIsAttacker || meIsDefender;

  useEffect(()=>{
    function onLobbies({ players, stake, lobbies, disabled }: any){
      setPlayersCount(players||2); setStake(stake||25);
      setLobbies(lobbies||[]); setDisabledMode(!!disabled);
    }
    function onJoined({ lobbyId, stake }: any){
      setLobbyId(lobbyId); setStake(stake); setStep("game");
      setHand([]); setTable([]); setTrump("♠"); setTrumpCard(null);
      setDeckCount(0); setDiscardCount(0); setAttacker(""); setDefender(""); setPlayers([]);
    }
    function onHand({ hand }: any){ setHand(hand||[]); }
    function onState(s:any){
      setTrump(s.trump || "♠"); setTrumpCard(s.trumpCard || null);
      setDeckCount(s.deckCount || 0); setDiscardCount(s.discardCount || 0);
      setAttacker(s.attacker); setDefender(s.defender);
      setTable(s.table || []); setPlayers(s.players || []);
    }
    function onEnded({ winner, stake }: any){
      alert(winner===userId ? `Победа! +${stake + Math.floor(stake*0.9)}` : "Поражение");
      setStep("menu"); setLobbyId(null); setHand([]);
    }

    socket.on("durak:lobbies", onLobbies);
    socket.on("durak:joined", onJoined);
    socket.on("durak:hand", onHand);
    socket.on("durak:state", onState);
    socket.on("durak:ended", onEnded);
    return ()=>{
      socket.off("durak:lobbies", onLobbies);
      socket.off("durak:joined", onJoined);
      socket.off("durak:hand", onHand);
      socket.off("durak:state", onState);
      socket.off("durak:ended", onEnded);
    };
  },[userId]);

  const oppPlayer = players.find(p=>p.userId!==userId) || { userId: "", handCount: 0 };
  const oppTurn = oppPlayer?.userId ? (attacker===oppPlayer.userId || defender===oppPlayer.userId) : false;

  // кнопка "бито" только у атакующего, когда все отбито
  const canBitoBtn = meIsAttacker && table.length>0 && table.every(p=>!!p.d);
  // кнопка "беру" только у защитника, когда есть неотбитые
  const canTakeBtn = meIsDefender && table.some(p=>!p.d);

  function askLobbies(){
    setStep("lobbies");
    socket.emit("durak:list", { players: playersCount, stake });
  }
  async function join(l:any){
    if (joining) return;
    try{
      setJoining(l.id);
      const roundId = Math.random().toString(36).slice(2);
      const res = await apiBet(userId, stake, roundId);
      if (!res.success){ alert(res.error || "Недостаточно средств"); setJoining(null); return; }
      setBalance(res.balance);
      socket.emit("durak:join", { lobbyId: l.id, userId });
    } finally { setJoining(null); }
  }
  function onClickCard(c:Card){
    if (!lobbyId) return;
    const emptyDefIndex = table.findIndex(p=>!p.d);
    if (meIsDefender && emptyDefIndex>=0){
      socket.emit("durak:move", { lobbyId, userId, action:"defend", payload:{ index: emptyDefIndex, card: c }});
      return;
    }
    if (meIsAttacker){
      const action = table.some(p=>p.d) ? "throw" : "attack";
      socket.emit("durak:move", { lobbyId, userId, action, payload:{ card: c }});
    }
  }
  const take = ()=> lobbyId && socket.emit("durak:move", { lobbyId, userId, action:"take" });
  const bito = ()=> lobbyId && socket.emit("durak:move", { lobbyId, userId, action:"bito" });

  return (
    <div className="p-4">
      {step==="menu" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={goBack} className="h-9 px-3 rounded-xl border border-white/10 text-white bg-white/5">Назад</button>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs">Баланс: {balance}</div>
          </div>
          <h2 className="text-xl font-semibold text-white">Дурак (подкидной, 36)</h2>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
            <div className="text-white/80">Количество игроков</div>
            <div className="flex flex-wrap gap-2">
              {[2,3,4,5,6].map(n=>(
                <button key={n} onClick={()=>setPlayersCount(n)}
                  className={cn("h-10 px-4 rounded-xl border",
                    playersCount===n ? "bg-neutral-700 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/80"
                  )}>{n}</button>
              ))}
            </div>
            <div className="text-white/80 mt-2">Ставка</div>
            <div className="flex flex-wrap gap-2">
              {[10,25,50,100,250,500].map(v=>(
                <button key={v} onClick={()=>setStake(v)} disabled={v>balance}
                  className={cn("h-10 px-4 rounded-xl border",
                    stake===v ? "bg-neutral-700 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/80",
                    v>balance && "opacity-40 cursor-not-allowed"
                  )}>{v}</button>
              ))}
            </div>
            <button onClick={askLobbies} className="w-full h-12 rounded-2xl border border-white/10 bg-white/10 text-white">Найти лобби</button>
          </div>
        </div>
      )}

      {step==="lobbies" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={()=>setStep("menu")} className="h-9 px-3 rounded-xl border border-white/10 text-white bg-white/5">Назад</button>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs">Ставка: {stake}</div>
          </div>
          <h3 className="text-white/90 font-semibold">Лобби (2 игрока)</h3>
          {disabledMode && (<div className="text-white/70 text-sm">Режим на {playersCount} игроков пока не доступен.</div>)}
          {!disabledMode && lobbies.length===0 && (<div className="text-white/60">Пусто. Обнови или зайди позже.</div>)}
          <div className="space-y-2">
            {lobbies.map(l=>(
              <div key={l.id} className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-white/5">
                <div className="text-white">{l.title}</div>
                <div className="text-white/70 text-sm">{l.count}/{l.capacity}</div>
                <button disabled={!!l.busy || joining===l.id} onClick={()=>join(l)}
                  className="h-9 px-3 rounded-xl border border-white/10 bg-white/10 text-white disabled:opacity-50">Войти</button>
              </div>
            ))}
          </div>
          <button onClick={()=>socket.emit("durak:list", { players: playersCount, stake })} className="h-10 px-4 rounded-xl border border-white/10 bg-white/10 text-white">Обновить</button>
        </div>
      )}

      {step==="game" && (
        <DurakSkin
          trump={trumpCard ? trumpCard.suit : trump}
          deckCount={deckCount}
          discardCount={discardCount}
          table={table}
          me={{ name: short(userId), avatarUrl: "", isTurn: myTurn, balance }}
          opp={{ name: short(oppPlayer.userId || ""), avatarUrl: "", isTurn: oppTurn, handCount: oppPlayer.handCount || 0 }}
          hand={hand}
          canTake={canTakeBtn}
          canBito={canBitoBtn}
          stake={stake}
          onCardClick={onClickCard}
          onTake={take}
          onBito={bito}
          // НОВОЕ: роль для подписи кнопки даже когда она disabled
          role={meIsDefender ? "defender" : meIsAttacker ? "attacker" : "none"}
        />
      )}
    </div>
  );

  function onClickCard(c:Card){
    if (!lobbyId) return;
    const emptyDefIndex = table.findIndex(p=>!p.d);
    if (meIsDefender && emptyDefIndex>=0){
      socket.emit("durak:move", { lobbyId, userId, action:"defend", payload:{ index: emptyDefIndex, card: c }});
      return;
    }
    if (meIsAttacker){
      const action = table.some(p=>p.d) ? "throw" : "attack";
      socket.emit("durak:move", { lobbyId, userId, action, payload:{ card: c }});
    }
  }
}

function short(id:string){
  if (!id) return "—";
  const m = id.match(/[a-z0-9]/i)?.[0] || "U";
  return id.startsWith("tg_") ? `TG:${m}` : m.toUpperCase();
}
