// src/screens/DurakSkin.tsx
import React, { useMemo, useRef, useState } from "react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: string; suit: Suit };
type TablePair = { a: Card; d?: Card | null };

export default function DurakSkin({
  trump,
  deckCount,
  discardCount,
  table,
  me,
  opp,
  hand,
  canTake,
  canBito,
  stake,
  secondsLeft,
  onCardClick,
  onTake,
  onBito,
  role,
}: {
  trump: Suit;
  deckCount: number;
  discardCount: number;
  table: TablePair[];
  me: { name: string; avatarUrl: string; isTurn: boolean; balance: number };
  opp: { name: string; avatarUrl: string; isTurn: boolean; handCount: number };
  hand: Card[];
  canTake: boolean;
  canBito: boolean;
  stake: number;
  secondsLeft: number | null;
  onCardClick: (c: Card) => void;
  onTake: () => void;
  onBito: () => void;
  role: "attacker" | "defender" | "none";
}) {
  const isRed = (s: Suit) => s === "♥" || s === "♦";
  const suitColor = (s: Suit) => (isRed(s) ? "#ff5d72" : "#38d39f");
  const cardShadow =
    "0 14px 28px -16px rgba(0,0,0,.8), inset 0 0 0 1px rgba(0,0,0,.03)";

  // подпись на кнопке
  const mainBtn = useMemo(() => {
    if (canTake) return { label: "Беру", kind: "take" as const, enabled: true };
    if (canBito) return { label: "Бито", kind: "bito" as const, enabled: true };
    return {
      label: opp.isTurn ? "Ход соперника…" : "Ждём…",
      kind: "none" as const,
      enabled: false,
    };
  }, [canTake, canBito, opp.isTurn]);

  // прогресс круга (60 секунд)
  const total = 60;
  const sec = secondsLeft ?? total;
  const C = 2 * Math.PI * 18; // окружность r=18

  return (
    <div
      className="relative w-full max-w-md mx-auto"
      style={{ height: "calc(100dvh - 96px)" }} // игровое поле без прокрутки
    >
      {/* Стол */}
      <div
        className="absolute inset-0 rounded-[24px] border border-white/10"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 20%, rgba(33,118,255,.18), rgba(10,15,20,.75))",
          boxShadow: "inset 0 0 160px rgba(0,0,0,.35)",
        }}
      >
        {/* Верхняя панель */}
        <div className="absolute left-4 top-3 right-4 flex items-start justify-between pointer-events-none select-none">
          <div className="text-white/80 text-sm">
            <div className="flex items-center gap-3">
              <div className="text-white/90">
                сброс: <b>{discardCount}</b>
              </div>

              {/* Таймер-кольцо — чуть левее, не наезжает */}
              <div className="relative w-9 h-9" style={{ marginLeft: -6 }}>
                <svg width="36" height="36" viewBox="0 0 40 40">
                  <circle
                    cx="20"
                    cy="20"
                    r="18"
                    stroke="rgba(255,255,255,.12)"
                    strokeWidth="3"
                    fill="none"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="18"
                    stroke="#38d39f"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={
                      C * (1 - Math.min(1, Math.max(0, sec / total)))
                    }
                    style={{ transition: "stroke-dashoffset 250ms linear" }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-white text-xs">
                  {Math.max(0, Math.min(total, sec))}
                </div>
              </div>
            </div>
          </div>

          {/* Колода + козырь справа компактно */}
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <div
                className="w-12 h-16 rounded-2xl bg-white/80"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, rgba(56,211,159,.25) 0 8px, rgba(56,211,159,.15) 8px 16px)",
                  boxShadow: cardShadow,
                }}
              />
              <div
                className="absolute -top-1 -left-1 w-12 h-16 rounded-2xl opacity-70"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, rgba(56,211,159,.25) 0 8px, rgba(56,211,159,.15) 8px 16px)",
                  boxShadow: cardShadow,
                }}
              />
            </div>

            <div className="text-white font-semibold text-xl leading-none">
              {deckCount}
            </div>

            {/* бейдж козыря */}
            <div
              className="px-2 py-1 rounded-xl text-sm font-semibold"
              style={{
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.12)",
                color: suitColor(trump),
                boxShadow: "0 6px 24px -12px rgba(0,0,0,.6)",
              }}
            >
              {trump}
            </div>

            <div className="ml-2 text-white/70 text-sm">ставка: {stake}</div>
          </div>
        </div>

        {/* Центр: стол — поднят выше, больше места под руку */}
        <div className="absolute inset-x-4 top-16 bottom-[210px]">
          <TableView table={table} suitColor={suitColor} cardShadow={cardShadow} />
        </div>

        {/* Рука игрока — интерактивная, выше кнопки */}
        <HandFan
          hand={hand}
          onCardClick={onCardClick}
          suitColor={suitColor}
          cardShadow={cardShadow}
        />

        {/* Главная кнопка — низ по центру */}
        <div
          className="absolute left-0 right-0 grid place-items-center"
          style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
        >
          <button
            disabled={!mainBtn.enabled}
            onClick={() => {
              if (mainBtn.kind === "take") onTake();
              if (mainBtn.kind === "bito") onBito();
            }}
            className="h-12 px-6 rounded-2xl border text-white backdrop-blur-md disabled:opacity-60"
            style={{
              minWidth: 220,
              background: mainBtn.enabled
                ? "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06))"
                : "rgba(255,255,255,.06)",
              borderColor: "rgba(255,255,255,.12)",
              boxShadow: "0 10px 40px -20px rgba(0,0,0,.7)",
            }}
          >
            {mainBtn.label}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== Hand (веер + увеличение на фокусе) =================== */

function HandFan({
  hand,
  onCardClick,
  suitColor,
  cardShadow,
}: {
  hand: Card[];
  onCardClick: (c: Card) => void;
  suitColor: (s: Suit) => string;
  cardShadow: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  // Геометрия: ряд (<=4) или веер (>=5)
  const geom = useMemo(() => {
    const n = Math.max(1, hand.length);
    const flat = n <= 4; // было 5 — теперь 4

    if (flat) {
      const gap = 92; // немногим шире, чтобы 4 карты красиво влезали
      const start = -((n - 1) / 2) * gap;
      return hand.map((_, i) => ({
        baseRot: 0,
        baseX: start + i * gap,
        baseY: 0,
      }));
    }

    const spreadDeg = Math.min(70, 10 + 3 * hand.length);
    const startDeg = -spreadDeg / 2;
    const stepDeg = hand.length > 1 ? spreadDeg / (hand.length - 1) : 0;
    const stepX = Math.max(26, 36 - Math.max(0, hand.length - 8) * 2);
    return hand.map((_, i) => ({
      baseRot: startDeg + i * stepDeg,
      baseX: (i - (hand.length - 1) / 2) * stepX,
      baseY: Math.abs(startDeg + i * stepDeg) * 0.8,
    }));
  }, [hand]);

  function indexFromClientX(clientX: number) {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    if (hand.length <= 1) return 0;
    return Math.max(
      0,
      Math.min(hand.length - 1, Math.round(((hand.length - 1) * x) / r.width))
    );
  }

  const onMove = (clientX: number) => setFocusIdx(indexFromClientX(clientX));

  return (
    <div
      className="pointer-events-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "calc(92px + env(safe-area-inset-bottom) + 56px)", // немного выше
        height: 200,
      }}
    >
      <div
        ref={wrapRef}
        className="relative mx-auto w-full max-w-[92%] h-full"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setFocusIdx(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setFocusIdx(null)}
      >
        {hand.map((c, i) => {
          const g = geom[i];
          const d = focusIdx == null ? 99 : Math.abs(i - focusIdx);
          const scale =
            focusIdx == null
              ? 1
              : d === 0
              ? 1.14
              : d === 1
              ? 1.07
              : d === 2
              ? 1.03
              : 1;
          const lift =
            focusIdx == null ? 0 : d === 0 ? 18 : d === 1 ? 10 : d === 2 ? 6 : 0;
          const spread =
            focusIdx == null
              ? 0
              : (i - (focusIdx as number)) *
                (d === 0 ? 0 : d === 1 ? 12 : d === 2 ? 6 : 0);
          const z = 10 + (focusIdx == null ? i : 100 - d * 10);

          return (
            <button
              key={i}
              className="absolute left-1/2 pointer-events-auto"
              style={{
                bottom: 0,
                transform: `translateX(-50%) translateX(${g.baseX + spread}px) translateY(${
                  g.baseY - lift
                }px) rotate(${g.baseRot}deg) scale(${scale})`,
                transition:
                  "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
                zIndex: z,
              }}
              onClick={() => onCardClick(c)}
            >
              <CardView c={c} suitColor={suitColor} cardShadow={cardShadow} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Cards & Table ================= */

function CardView({
  c,
  suitColor,
  cardShadow,
}: {
  c: Card;
  suitColor: (s: Suit) => string;
  cardShadow: string;
}) {
  const red = c.suit === "♥" || c.suit === "♦";

  return (
    <div
      className="w-[72px] h-[104px] sm:w-[80px] sm:h-[116px] rounded-2xl grid"
      style={{
        gridTemplateRows: "1fr auto 1fr",
        background: "linear-gradient(180deg, #ffffff, #f4f6fa)",
        border: "1px solid rgba(0,0,0,.06)",
        boxShadow: cardShadow,
        willChange: "transform",
      }}
    >
      {/* верхний угол — масть */}
      <div
        className="p-2 text-xs font-semibold"
        style={{ color: suitColor(c.suit) }}
      >
        {c.suit}
      </div>

      {/* центр — крупный номинал */}
      <div className="grid place-items-center">
        <div
          className="font-extrabold tracking-wider"
          style={{
            fontSize: 28,
            color: red ? "#ff5d72" : "#38d39f",
            textShadow: "0 1px 0 rgba(0,0,0,.15)",
          }}
        >
          {c.rank}
        </div>
      </div>

      {/* нижний угол — масть */}
      <div
        className="p-2 text-xs font-semibold justify-self-end self-end"
        style={{ color: suitColor(c.suit) }}
      >
        {c.suit}
      </div>
    </div>
  );
}

function TableView({
  table,
  suitColor,
  cardShadow,
}: {
  table: TablePair[];
  suitColor: (s: Suit) => string;
  cardShadow: string;
}) {
  if (!table || table.length === 0) {
    return (
      <div className="w-full h-full grid place-items-center">
        <div
          className="px-4 py-3 rounded-2xl text-white/80 text-sm"
          style={{
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.12)",
          }}
        >
          Стол пуст — ждём карту.
        </div>
      </div>
    );
  }

  // пары — в 2 ряда по центру
  return (
    <div className="w-full h-full grid place-items-center">
      <div className="relative w-[92%] max-w-[520px] min-h-[160px]">
        {table.map((p, i) => {
          const x = (i % 3) * 120 - 120;
          const y = Math.floor(i / 3) * 130;
          return (
            <div
              key={i}
              className="absolute left-1/2"
              style={{ transform: `translateX(-50%) translate(${x}px, ${y}px)` }}
            >
              <CardView c={p.a} suitColor={suitColor} cardShadow={cardShadow} />
              {p.d && (
                <div className="absolute left-[54px] top-[18px] rotate-12">
                  <CardView c={p.d} suitColor={suitColor} cardShadow={cardShadow} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
