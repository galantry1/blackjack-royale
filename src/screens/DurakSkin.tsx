import React, {useEffect, useMemo, useRef, useState} from "react";
import {motion} from "framer-motion";
import {Flag, Hourglass, Handshake, Info, Coins, Crown, Check} from "lucide-react";

export type Card = { rank: string; suit: string; id?: string };
export type TablePair = { a: Card; d?: Card | null };

export type DurakSkinProps = {
  trump: string; deckCount: number; discardCount?: number; table: TablePair[];
  me: { name: string; avatarUrl?: string; isTurn: boolean; balance?: number };
  opp: { name: string; avatarUrl?: string; isTurn: boolean; handCount: number };
  hand: Card[]; canTake?: boolean; canBito?: boolean; stake?: number;
  onCardClick?: (card: Card) => void; onTake?: () => void; onBito?: () => void;
  role?: "attacker" | "defender" | "none";
};

const isRed = (s:string)=> s==="♥"||s==="♦";
const suitColorClass = (s:string)=> (isRed(s) ? "text-[#E23A4E]" : "text-[#111827]");
const suitBgClass   = (s:string)=> (isRed(s) ? "bg-[#FFF5F6]" : "bg-white");

/* ---------- layout wrappers ---------- */
function Felt({children}:{children:React.ReactNode}) {
  return (
    <div className="relative mx-auto h-[100svh] w-full max-w-[820px] overflow-hidden bg-felt text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_60%)]" />
      {children}
    </div>
  );
}
function TopHUD({ stake=0, balance=0 }:{stake?:number; balance?:number}) {
  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-3 pt-2 text-white/95">
      <div className="flex items-center gap-2 opacity-80">
        <Flag className="h-5 w-5"/><Hourglass className="h-5 w-5"/><Handshake className="h-5 w-5"/><Info className="h-5 w-5"/>
      </div>
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        {stake>0 && <span className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2 py-1 backdrop-blur"><Crown className="h-4 w-4"/>{stake}</span>}
        <span className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2 py-1 backdrop-blur"><Coins className="h-4 w-4"/>{balance}</span>
      </div>
    </div>
  );
}

/* ---------- small atoms ---------- */
function AvatarBadge({name, avatarUrl, isTurn, count}:{name:string; avatarUrl?:string; isTurn:boolean; count?:number}){
  return (
    <div className="relative">
      <div className={"mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 shadow-xl ring-2 ring-offset-2 ring-offset-black/20 backdrop-blur "+(isTurn?" ring-[#36FF6C] drop-shadow-[0_0_12px_#36FF6C]":" ring-[#FF4D4D] drop-shadow-[0_0_10px_#FF4D4D]")}>
        {avatarUrl ? <img src={avatarUrl} className="h-full w-full rounded-2xl object-cover" alt={name}/> : <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white/10 text-xs font-semibold">{name?.[0]||"?"}</div>}
      </div>
      <div className="mt-1 text-center text-xs text-white/90">
        <div className="truncate max-w-[80px]">{name||"—"}</div>
        {typeof count==="number" && <div className="text-[10px] text-white/70">карты: {count}</div>}
      </div>
    </div>
  );
}
function CardFace({ card, onClick }:{card:Card; onClick?:()=>void}) {
  const color=suitColorClass(card.suit), bg=suitBgClass(card.suit);
  const isFace=card.rank==="К"||card.rank==="Д"||card.rank==="В";
  const isAce =card.rank==="Т";
  return (
    <motion.button whileTap={{scale:0.98}} onClick={onClick}
      className={`relative aspect-[64/89] w-[68px] select-none rounded-2xl ${bg} shadow-[0_6px_16px_rgba(0,0,0,0.35)] ring-1 ring-black/10`}>
      <div className="absolute inset-0 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.5),transparent_40%,transparent_60%,rgba(255,255,255,0.08))]" />
      <div className="absolute inset-1 rounded-xl border border-black/10" />
      <div className={`absolute left-1 top-1 text-[14px] font-bold leading-none ${color}`}>{card.rank}<div>{card.suit}</div></div>
      <div className={`absolute bottom-1 right-1 rotate-180 text-[14px] font-bold leading-none ${color}`}>{card.rank}<div>{card.suit}</div></div>
      <div className={`absolute inset-0 grid place-items-center ${isFace?"text-base":isAce?"text-5xl":"text-3xl"} ${color}`}>
        {isFace?card.rank:card.suit}
      </div>
    </motion.button>
  );
}
function CardBack({className=""}:{className?:string}) {
  return <div className={`aspect-[64/89] w-[68px] rounded-xl bg-card-back shadow-[0_6px_16px_rgba(0,0,0,0.35)] ring-1 ring-black/10 ${className}`}/>;
}
function TablePairs({pairs}:{pairs:TablePair[]}) {
  return (
    <div className="mx-auto grid max-w-[560px] grid-cols-2 gap-4 px-4 pt-16">
      {pairs.map((p,idx)=>(
        <div key={idx} className="relative h-[calc(68px*1.4)] w-[180px] max-w-full">
          <motion.div initial={{y:-10,opacity:0}} animate={{y:0,opacity:1}} transition={{type:"spring",stiffness:260,damping:24}} className="absolute left-0 top-0"><CardFace card={p.a}/></motion.div>
          {p.d && <motion.div initial={{y:10,rotate:8,opacity:0}} animate={{y:6,rotate:8,opacity:1}} transition={{type:"spring",stiffness:260,damping:24}} className="absolute left-6 top-4"><CardFace card={p.d}/></motion.div>}
        </div>
      ))}
    </div>
  );
}

/* ---------- HAND (fixed + true center on table width) ---------- */
function HandSmart({ hand, onCardClick }:{ hand:Card[]; onCardClick?: (c:Card)=>void }) {
  // ВАЖНО: измеряем ширину именно ВНУТРЕННЕГО контейнера стола (max-w-[640px]),
  // а не всего окна — так рука центрируется идеально.
  const wrapRef = useRef<HTMLDivElement|null>(null);
  const [width, setWidth] = useState(360);
  const [focus, setFocus] = useState<number|null>(null);

  useEffect(()=>{
    const el = wrapRef.current; if(!el) return;
    const update = ()=> setWidth(el.clientWidth || el.getBoundingClientRect().width || 360);
    const RO = (window as any).ResizeObserver; const ro = RO? new RO(update):null;
    update(); ro?.observe(el); window.addEventListener("resize", update);
    return ()=>{ ro?.disconnect(); window.removeEventListener("resize", update); };
  },[]);

  // раскладка: ≤5 — без веера (широко), 6–7 — полу-веер, overflow — узкий веер.
  const layout = useMemo(()=>{
    const n = hand.length, cardW = 68;
    if (n===0) return {items:[], height: cardW*1.7};
    let gap   = n<=5 ? cardW*0.95 : n<=7 ? cardW*0.7 : cardW*0.35;
    let span  = n<=5 ? 0          : n<=7 ? 10         : 0;  // deg
    const totalIdeal = n>1 ? cardW + gap*(n-1) : cardW;
    if (totalIdeal > width - 24) {              // не влазит
      const overflowRatio = totalIdeal / Math.max(140, width-24);
      gap  = Math.max(cardW*0.18, gap/overflowRatio);
      span = Math.max(span, 12);
    }
    const step = n>1 ? span/(n-1) : 0;
    const startAng = -span/2;
    const startX   = -((n-1)*gap)/2;
    const items = hand.map((c,i)=>({ c, i, x: startX + i*gap, rot: startAng + i*step }));
    return {items, height: cardW*1.7};
  },[hand, width]);

  const onPointerMove = (clientX:number)=>{
    const el = wrapRef.current; if(!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width/2);
    let best = 0, bestDist = Infinity;
    layout.items.forEach(it=>{ const d=Math.abs(x-it.x); if(d<bestDist){bestDist=d; best=it.i;} });
    setFocus(best);
  };

  return (
    <div
      className="pointer-events-auto fixed left-0 right-0 z-30"
      style={{ bottom: "calc(160px + env(safe-area-inset-bottom))" }}  // рука строго над кнопкой
      onMouseLeave={()=>setFocus(null)}
      onTouchEnd={()=>setFocus(null)}
      onMouseMove={(e)=>onPointerMove(e.clientX)}
      onTouchMove={(e)=>{ if(e.touches?.[0]) onPointerMove(e.touches[0].clientX); }}
    >
      {/* ЦЕНТР: ровно как стол — max-w-[640px] */}
      <div ref={wrapRef} className="relative mx-auto w-full max-w-[640px] px-3" style={{height: layout.height}}>
        {layout.items.map(({c,i,x,rot})=>(
          <motion.div key={c.id || `${c.rank}${c.suit}${i}`} style={{ left:"50%", transform:`translateX(${x}px) rotate(${rot}deg)` }} className="absolute bottom-0">
            <motion.div animate={ i===focus ? { y:-10, scale:1.08 } : { y:0, scale:1 } } transition={{ type:"spring", stiffness:300, damping:24 }}>
              <CardFace card={c} onClick={()=>onCardClick?.(c)} />
            </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------- main ---------- */
export default function DurakSkin(props: DurakSkinProps){
  const { trump, deckCount, discardCount=0, table, me, opp, hand, canTake=false, canBito=false, stake=0, onCardClick, onTake, onBito, role="none" } = props;

  const wantAction: "take" | "bito" | null = role==="defender" ? "take" : role==="attacker" ? "bito" : null;
  const actionable = (wantAction==="take" && canTake) || (wantAction==="bito" && canBito);

  return (
    <Felt>
      <TopHUD stake={stake} balance={me.balance || 0} />

      {/* верх */}
      <div className="pt-10">
        <div className="mx-auto flex max-w-[640px] items-end justify-center gap-6 px-3">
          <div className="flex flex-col items-center gap-1 text-white/80">
            <span className="text-lg font-bold">{discardCount}</span>
            <span className="text-[11px]">сброс</span>
          </div>
          <div className="relative flex flex-col items-center">
            <AvatarBadge name={opp.name || "-"} avatarUrl={opp.avatarUrl} isTurn={opp.isTurn} count={opp.handCount} />
            <div className="mt-2 flex items-center gap-2">
              <div className="relative">
                <CardBack className="translate-x-0"/><CardBack className="absolute left-1 top-1 rotate-[-3deg]"/><CardBack className="absolute left-2 top-2 rotate-[-6deg]"/>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <span className="text-2xl font-extrabold leading-none">{deckCount}</span>
                <div className="text-xs opacity-80"><div>козырь</div><div className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-sm"><span className="text-white">{trump}</span></div></div>
              </div>
            </div>
          </div>
          <div className="w-[56px]" />
        </div>
      </div>

      {/* стол */}
      <TablePairs pairs={table} />

      {/* рука (фикс + идеальный центр по ширине стола) */}
      <HandSmart hand={hand} onCardClick={onCardClick} />

      {/* одна кнопка по центру снизу, всегда видна; пульс когда активна */}
      {wantAction && (
        <div className="fixed left-1/2 z-40 -translate-x-1/2" style={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}>
          {wantAction === "take" ? (
            <button disabled={!actionable} onClick={onTake}
              className={"h-12 min-w-[170px] rounded-2xl px-6 text-lg font-bold shadow-xl transition-all "+
                (actionable ? "bg-white text-[#E23A4E] ring-2 ring-[#ffccd4] animate-pulse" : "bg-white/40 text-white/60")}>
              Беру
            </button>
          ) : (
            <button disabled={!actionable} onClick={onBito}
              className={"h-12 min-w-[170px] rounded-2xl px-6 text-lg font-bold shadow-xl transition-all "+
                (actionable ? "bg-white text-black ring-2 ring-white/60 animate-pulse" : "bg-white/40 text-white/60")}>
              <span className="inline-flex items-center gap-2"><Check className="h-5 w-5"/> Бито</span>
            </button>
          )}
        </div>
      )}
    </Felt>
  );
}
