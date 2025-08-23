// src/screens/DurakSkin.tsx
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";

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
  onCardClick, // не используем: сброс только перетаскиванием
  onDrop,
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
  onDrop: (c: Card, pairIndex: number | null) => void;
  onTake: () => void;
  onBito: () => void;
  role: "attacker" | "defender" | "none";
}) {
  const isRed = (s: Suit) => s === "♥" || s === "♦";
  const suitColor = (s: Suit) => (isRed(s) ? "#ff5d72" : "#38d39f");
  const cardShadow =
    "0 14px 28px -16px rgba(0,0,0,.8), inset 0 0 0 1px rgba(0,0,0,.03)";

  const mainBtn = useMemo(() => {
    if (canTake) return { label: "Беру", kind: "take" as const, enabled: true };
    if (canBito) return { label: "Бито", kind: "bito" as const, enabled: true };
    return {
      label: me.isTurn ? "Ваш ход" : "Ход соперника…",
      kind: "none" as const,
      enabled: false,
    };
  }, [canTake, canBito, me.isTurn]);

  // таймер
  const total = 60;
  const sec = secondsLeft ?? total;
  const C = 2 * Math.PI * 18;

  // refs для зон
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLSpanElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const oppOriginRef = useRef<HTMLDivElement>(null);
  const handAreaRef = useRef<HTMLDivElement>(null);

  /* ==================== FX: ЛЕТАЮЩИЕ КАРТЫ ==================== */
  type Fly = {
    id: number;
    card: Card;
    from: { x: number; y: number };
    to: { x: number; y: number };
    rotate?: number;
    duration?: number;
    scaleFrom?: number;
    scaleTo?: number;
  };
  const [flies, setFlies] = useState<Fly[]>([]);
  const flyId = useRef(1);
  const pushFly = (f: Omit<Fly, "id">) =>
    setFlies((arr) => [...arr, { ...f, id: flyId.current++ }]);
  const removeFly = (id: number) =>
    setFlies((arr) => arr.filter((x) => x.id !== id));

  // компонент одиночного полёта
  const FlyCard: React.FC<{ f: Fly }> = ({ f }) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [atTo, setAtTo] = useState(false);
    useEffect(() => {
      const t = requestAnimationFrame(() => setAtTo(true));
      return () => cancelAnimationFrame(t);
    }, []);
    const dur = f.duration ?? 450;
    const rot = f.rotate ?? (Math.random() * 16 - 8);
    const scFrom = f.scaleFrom ?? 1;
    const scTo = f.scaleTo ?? 1;
    const style: React.CSSProperties = {
      position: "fixed",
      left: 0,
      top: 0,
      transform: `translate(${(atTo ? f.to.x : f.from.x) - 40}px, ${(atTo ? f.to.y : f.from.y) - 56}px) rotate(${rot}deg) scale(${atTo ? scTo : scFrom})`,
      transition: `transform ${dur}ms cubic-bezier(.2,.85,.25,1)`,
      pointerEvents: "none",
      zIndex: 999,
    };
    return (
      <div
        ref={nodeRef}
        style={style}
        onTransitionEnd={() => removeFly(f.id)}
      >
        <CardView c={f.card} suitColor={suitColor} cardShadow={cardShadow} alpha={1} />
      </div>
    );
  };

  /* ==================== DIFF-ЛОГИКА ДЛЯ FX ==================== */
  const prevTableRef = useRef<TablePair[]>(table);
  const prevDeckRef = useRef<number>(deckCount);
  const prevDiscardRef = useRef<number>(discardCount);
  const prevHandLenRef = useRef<number>(hand.length);
  const prevRoleRef = useRef<typeof role>(role);

  // при ручном «Беру» запускаем оптимистичную анимацию и блокируем дифф-анимацию один раз
  const manualTakeTsRef = useRef<number | null>(null);

  // Сохраняем геометрию прошлого стола (центры карт a/d)
  type Rects = Record<
    number,
    {
      a?: { x: number; y: number };
      d?: { x: number; y: number };
    }
  >;
  const prevRectsRef = useRef<Rects>({});

  const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  // Снимаем текущие rect'ы после каждого рендера — для следующего diff
  useEffect(() => {
    const rects: Rects = {};
    const nodesA = Array.from(
      document.querySelectorAll<HTMLElement>('[data-attack-slot="1"]')
    );
    for (const el of nodesA) {
      const i = Number(el.dataset.idx || "-1");
      if (Number.isNaN(i)) continue;
      rects[i] = rects[i] || {};
      rects[i].a = center(el.getBoundingClientRect());
    }
    const nodesD = Array.from(
      document.querySelectorAll<HTMLElement>('[data-defend-slot="1"]')
    );
    for (const el of nodesD) {
      const i = Number(el.dataset.idx || "-1");
      if (Number.isNaN(i)) continue;
      rects[i] = rects[i] || {};
      rects[i].d = center(el.getBoundingClientRect());
    }
    prevRectsRef.current = rects;
  });

  // индексы, на которых только что добавили защиту — для «падения» карты
  const [justDefended, setJustDefended] = useState<number[]>([]);
  // индекс атакующей карты, над которой сейчас держим защитную (подсветка заранее)
  const [hoverDefIdx, setHoverDefIdx] = useState<number | null>(null);

  // главная диф-фаза: сравниваем предыдущее и текущее состояние и спавним FX
  useEffect(() => {
    const prevTable = prevTableRef.current;
    const prevDeck = prevDeckRef.current;
    const prevDiscard = prevDiscardRef.current;
    const prevHandLen = prevHandLenRef.current;
    const prevRole = prevRoleRef.current;

    // 1) «Падение» защитной карты + краткий пульс у бьющейся
    const newlyDefended: number[] = [];
    table.forEach((p, i) => {
      if (p?.d && !(prevTable?.[i]?.d)) newlyDefended.push(i);
    });
    if (newlyDefended.length) {
      setJustDefended(newlyDefended);
      const t = setTimeout(() => setJustDefended([]), 700);
      return () => clearTimeout(t);
    }

    // 2) Соперник кинул новую атакующую: я — защитник
    if (table.length > (prevTable?.length ?? 0) && role === "defender") {
      const newIdx = table.length - 1;
      const targetEl = document.querySelector<HTMLElement>(
        `[data-attack-slot="1"][data-idx="${newIdx}"]`
      );
      const oppPoint = oppOriginRef.current?.getBoundingClientRect();
      const to = targetEl ? center(targetEl.getBoundingClientRect()) : null;
      const from = oppPoint ? { x: oppPoint.left, y: oppPoint.top } : null;
      const card = table[newIdx]?.a;
      if (from && to && card) {
        pushFly({ card, from, to, duration: 420, scaleFrom: 0.92, scaleTo: 1.0 });
      }
    }

    // 3) Бито: стол был не пуст, стал пуст, discardCount вырос
    if ((prevTable?.length ?? 0) > 0 && table.length === 0 && discardCount > prevDiscard) {
      const toRect = discardRef.current?.getBoundingClientRect();
      if (toRect) {
        const to = center(toRect);
        const prevRects = prevRectsRef.current;
        Object.keys(prevRects).forEach((k) => {
          const i = Number(k);
          const a = prevRects[i]?.a;
          const d = prevRects[i]?.d;
          const pair = prevTable?.[i];
          if (pair?.a && a) {
            pushFly({ card: pair.a as Card, from: a, to, rotate: 25, duration: 520, scaleFrom: 1, scaleTo: 0.92 });
          }
          if (pair?.d && d) {
            pushFly({ card: pair.d as Card, from: d, to, rotate: -10, duration: 560, scaleFrom: 1, scaleTo: 0.92 });
          }
        });
      }
    }

    // 4) Взял карты со стола: стол был не пуст → пуст, discard не вырос
    const skipByManualTake =
      manualTakeTsRef.current && Date.now() - manualTakeTsRef.current < 900;
    if (
      !skipByManualTake &&
      (prevTable?.length ?? 0) > 0 &&
      table.length === 0 &&
      discardCount === prevDiscard
    ) {
      const prevRects = prevRectsRef.current;
      const toMy = handAreaRef.current?.getBoundingClientRect();
      const toOpp = oppOriginRef.current?.getBoundingClientRect();
      const to = (prevRole === "defender" ? toMy : toOpp) || toOpp || toMy;
      if (to) {
        const toC = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
        Object.keys(prevRects).forEach((k) => {
          const i = Number(k);
          const a = prevRects[i]?.a;
          const d = prevRects[i]?.d;
          const pair = prevTable?.[i];
          if (pair?.a && a) pushFly({ card: pair.a, from: a, to: toC, duration: 460, scaleFrom: 1, scaleTo: 0.9 });
          if (pair?.d && d) pushFly({ card: pair.d as Card, from: d, to: toC, duration: 480, scaleFrom: 1, scaleTo: 0.9 });
        });
      }
    }

    // 5) Добор из колоды в руку: рука выросла, колода уменьшилась
    if (hand.length > prevHandLen && deckCount < prevDeck) {
      const count = Math.min(prevDeck - deckCount, hand.length - prevHandLen);
      const fromRect = deckRef.current?.getBoundingClientRect();
      const toRect = handAreaRef.current?.getBoundingClientRect();
      if (fromRect && toRect && count > 0) {
        const from = center(fromRect);
        const to = center(toRect);
        for (let i = 0; i < count; i++) {
          const delay = i * 90;
          setTimeout(() => {
            const card = hand[hand.length - 1 - i] || hand[hand.length - 1] || { rank: "6", suit: trump };
            pushFly({ card: card as Card, from, to, duration: 380 });
          }, delay);
        }
      }
    }

    // обновляем "предыдущее" состояние
    prevTableRef.current = table;
    prevDeckRef.current = deckCount;
    prevDiscardRef.current = discardCount;
    prevHandLenRef.current = hand.length;
    prevRoleRef.current = role;
    // сброс блокировки ручного take спустя цикл
    if (manualTakeTsRef.current && skipByManualTake) {
      setTimeout(() => (manualTakeTsRef.current = null), 900);
    }
  }, [table, discardCount, deckCount, hand, role, trump]);

  // ====================== Drag ======================
  const [drag, setDrag] = useState<{
    card: Card;
    idx: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  // расширение зоны попадания при защите (можно бросать рядом)
  const HIT_MARGIN = 44; // px

  const startDrag = (idx: number, card: Card, x: number, y: number) => {
    setDrag({ card, idx, x, y, active: true });
  };
  const moveDrag = (x: number, y: number) => {
    setDrag((d) => (d ? { ...d, x, y } : d));
    // подсветка целевой атакующей при защите — заранее
    if (role === "defender") {
      const idx = getDropTarget(x, y, HIT_MARGIN);
      setHoverDefIdx(idx);
    }
  };
  const endDrag = (x: number, y: number) => {
    setDrag((d) => {
      if (!d) return null;
      const target = getDropTarget(x, y, HIT_MARGIN);
      if ((role === "defender" && target != null) || (role === "attacker" && target === null)) {
        onDrop(d.card, target);
      }
      return null;
    });
    setHoverDefIdx(null);
  };

  // цель дропа (с доп. margin для защиты)
  const getDropTarget = useCallback(
    (x: number, y: number, margin = 0): number | null => {
      const point = { x, y };
      const inside = (r: DOMRect) =>
        point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
      const insideWithMargin = (r: DOMRect) =>
        point.x >= r.left - margin &&
        point.x <= r.right + margin &&
        point.y >= r.top - margin &&
        point.y <= r.bottom + margin;

      if (role === "defender") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>('[data-attack-slot="1"]')
        );
        for (const el of nodes) {
          const idx = Number(el.dataset.idx || "-1");
          if (Number.isNaN(idx)) continue;
          if (table[idx]?.d) continue;
          const r = el.getBoundingClientRect();
          if (margin ? insideWithMargin(r) : inside(r)) return idx;
        }
        return null;
      }

      if (role === "attacker") {
        const r = tableAreaRef.current?.getBoundingClientRect();
        if (r && inside(r)) return null; // null = просто на стол
        return null;
      }

      return null;
    },
    [role, table]
  );

  // оптимистичная анимация «Беру»
  const animateTakeNow = useCallback(() => {
    const rectsNow: Rects = {};
    const nodesA = Array.from(
      document.querySelectorAll<HTMLElement>('[data-attack-slot="1"]')
    );
    for (const el of nodesA) {
      const i = Number(el.dataset.idx || "-1");
      if (Number.isNaN(i)) continue;
      rectsNow[i] = rectsNow[i] || {};
      rectsNow[i].a = center(el.getBoundingClientRect());
    }
    const nodesD = Array.from(
      document.querySelectorAll<HTMLElement>('[data-defend-slot="1"]')
    );
    for (const el of nodesD) {
      const i = Number(el.dataset.idx || "-1");
      if (Number.isNaN(i)) continue;
      rectsNow[i] = rectsNow[i] || {};
      rectsNow[i].d = center(el.getBoundingClientRect());
    }
    const toRect = handAreaRef.current?.getBoundingClientRect();
    if (!toRect) return;
    const to = { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 };

    Object.keys(rectsNow).forEach((k) => {
      const i = Number(k);
      const a = rectsNow[i]?.a;
      const d = rectsNow[i]?.d;
      const pair = table?.[i];
      if (pair?.a && a) pushFly({ card: pair.a, from: a, to, duration: 460, scaleFrom: 1, scaleTo: 0.9 });
      if (pair?.d && d) pushFly({ card: pair.d as Card, from: d, to, duration: 480, scaleFrom: 1, scaleTo: 0.9 });
    });
    manualTakeTsRef.current = Date.now();
  }, [table]);

  const handleMainBtnClick = () => {
    if (!mainBtn.enabled) return;
    if (mainBtn.kind === "take") {
      animateTakeNow(); // показать полёт немедленно
      onTake();
      return;
    }
    if (mainBtn.kind === "bito") {
      onBito();
      return;
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto" style={{ height: "calc(100dvh - 96px)" }}>
      {/* локальные keyframes */}
      <style>{`
        @keyframes defendFall {
          0% { transform: rotate(8deg) translate(0,-18px) scale(0.96); }
          70% { transform: rotate(2deg) translate(2px,2px) scale(1.02); }
          100% { transform: rotate(12deg) translate(0,0) scale(1); }
        }
        @keyframes pulseEdge {
          0% { box-shadow: 0 0 0 2px rgba(255,80,80,.85), 0 0 16px rgba(255,60,60,.35); }
          100% { box-shadow: 0 0 0 2px rgba(255,80,80,0), 0 0 16px rgba(255,60,60,0); }
        }
      `}</style>

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
                сброс:{" "}
                <b ref={discardRef}>{discardCount}</b>
              </div>
              <div className="text-white/80">
                соперник: <b>{Math.max(0, opp.handCount || 0)}</b>
              </div>
              <div className="relative w-9 h-9 ml-1">
                <svg width="36" height="36" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="18" stroke="rgba(255,255,255,.12)" strokeWidth="3" fill="none" />
                  <circle
                    cx="20" cy="20" r="18"
                    stroke="#38d39f" strokeWidth="3" fill="none" strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - Math.min(1, Math.max(0, sec / total)))}
                    style={{ transition: "stroke-dashoffset 250ms linear" }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-white text-xs">
                  {Math.max(0, Math.min(total, sec))}
                </div>
              </div>
            </div>
          </div>

          {/* Колода/козырь/ставка */}
          <div className="relative flex items-center gap-2">
            <div className="relative" ref={deckRef}>
              <div
                className="w-12 h-16 rounded-2xl bg-white"
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

            <div className="text-white font-semibold text-xl leading-none">{deckCount}</div>

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

        {/* Центр: стол + точка старта для анимации соперника */}
        <div ref={tableAreaRef} className="absolute inset-x-4 top-20 bottom-[170px]">
          <div
            ref={oppOriginRef}
            className="absolute left-1/2 -translate-x-1/2"
            style={{ top: -8, width: 1, height: 1 }}
          />
          <TableView
            table={table}
            suitColor={suitColor}
            cardShadow={cardShadow}
            justDefended={justDefended}
            hoverDefIdx={hoverDefIdx}
          />
        </div>

        {/* Рука */}
        <HandFan
          hand={hand}
          suitColor={suitColor}
          cardShadow={cardShadow}
          draggingIndex={drag?.idx ?? null}
          onDragStart={startDrag}
          onDragMove={moveDrag}
          onDragEnd={endDrag}
          externalWrapRef={handAreaRef}
        />

        {/* Кнопка */}
        <div className="absolute left-0 right-0 grid place-items-center" style={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}>
          <button
            disabled={!mainBtn.enabled}
            onClick={handleMainBtnClick}
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

      {/* Оверлей перетаскиваемой карты — полностью непрозрачный */}
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-[998]">
          <div
            className="absolute"
            style={{
              left: drag.x - 40,
              top: drag.y - 56,
              transform: "rotate(0deg) scale(1.12)",
              transition: "transform 60ms linear",
            }}
          >
            <CardView c={drag.card} suitColor={suitColor} cardShadow={cardShadow} alpha={1} />
          </div>
        </div>
      )}

      {/* FX: летящие карты */}
      {flies.map((f) => <FlyCard key={f.id} f={f} />)}
    </div>
  );
}

/* =================== Hand (веер + hover; drag стартует только при движении ВВЕРХ) =================== */

function HandFan({
  hand,
  suitColor,
  cardShadow,
  draggingIndex,
  onDragStart,
  onDragMove,
  onDragEnd,
  externalWrapRef,
}: {
  hand: Card[];
  suitColor: (s: Suit) => string;
  cardShadow: string;
  draggingIndex: number | null;
  onDragStart: (idx: number, card: Card, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  externalWrapRef?: React.RefObject<HTMLDivElement>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // пробрасываем внешний ref для целей анимации
  const setWrapRef = (el: HTMLDivElement | null) => {
    // @ts-ignore
    wrapRef.current = el;
    if (externalWrapRef) (externalWrapRef as any).current = el;
  };

  // ховер-индекс (для увеличения/подсветки при свайпе влево/вправо)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // состояние “нажатия” (но без начала drag до порога по вертикали)
  const pressRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    idx: number;
    card: Card;
    dragging: boolean;
  } | null>(null);

  const n = hand.length;

  // карта по X
  function indexFromClientX(clientX: number) {
    const el = wrapRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    if (n <= 1) return 0;
    return Math.max(0, Math.min(n - 1, Math.round(((n - 1) * x) / r.width)));
  }

  // базовая геометрия веера (шире — чтобы читались масти)
  const baseGeom = useMemo(() => {
    if (n <= 3) {
      const gap = 92;
      const start = -((n - 1) / 2) * gap;
      return hand.map((_, i) => ({ baseRot: 0, baseX: start + i * gap, baseY: 0 }));
    }
    const spreadDeg = Math.min(92, 18 + 4 * n);
    const startDeg = -spreadDeg / 2;
    const stepDeg = n > 1 ? spreadDeg / (n - 1) : 0;
    const baseStepX = 48;
    const stepX = Math.max(26, baseStepX - Math.max(0, n - 8) * 3);
    return hand.map((_, i) => {
      const rot = startDeg + i * stepDeg;
      return { baseRot: rot, baseX: (i - (n - 1) / 2) * stepX, baseY: Math.abs(rot) * 0.8 };
    });
  }, [hand, n]);

  // порог, после которого начинаем drag (движение ВВЕРХ)
  const DRAG_START_DY = -24; // нужно уйти вверх минимум на 24px

  // window-pointermove: управляем hover и, при необходимости, drag
  const onWinMove = useCallback((e: PointerEvent) => {
    const pr = pressRef.current;

    // всегда обновляем hover по X (для подсветки под пальцем)
    const idxUnderFinger = indexFromClientX(e.clientX);
    if (idxUnderFinger != null) setHoverIdx(idxUnderFinger);

    if (!pr) return;
    const dy = e.clientY - pr.startY;

    // если drag ещё не начался — ждём движения ВВЕРХ
    if (!pr.dragging) {
      if (dy <= DRAG_START_DY) {
        // берём карту под пальцем В МОМЕНТ старта drag
        const idxNow = idxUnderFinger ?? pr.idx;
        const cardNow = hand[idxNow] ?? pr.card;
        pressRef.current = { ...pr, idx: idxNow, card: cardNow, dragging: true };
        onDragStart(idxNow, cardNow, e.clientX, e.clientY);
      }
      return;
    }

    // drag активен — двигаем оверлей
    onDragMove(e.clientX, e.clientY);
  }, [onDragMove, hand]);

  const onWinUp = useCallback((e: PointerEvent) => {
    const pr = pressRef.current;
    window.removeEventListener("pointermove", onWinMove);
    window.removeEventListener("pointerup", onWinUp, true);
    if (pr?.dragging) {
      onDragEnd(e.clientX, e.clientY);
    }
    pressRef.current = null;
  }, [onDragEnd, onWinMove]);

  // pointerdown по конкретной карте — но drag пока НЕ запускаем
  const handlePointerDown = (i: number, c: Card) => (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pressRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      idx: i,
      card: c,
      dragging: false,
    };
    setHoverIdx(i); // сразу подсветим эту карту
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp, true);
  };

  // ховер-эффект (для мыши/не зажатого пальца)
  const onMove = (clientX: number) => {
    if (pressRef.current?.dragging || pressRef.current) return;
    const idx = indexFromClientX(clientX);
    if (idx != null) setHoverIdx(idx);
  };

  // стиль карты с учётом hover + “расхождения” при активном drag
  function cardStyle(i: number) {
    const g = baseGeom[i];

    const d = hoverIdx == null ? 99 : Math.abs(i - (hoverIdx as number));
    const scale = hoverIdx == null ? 1 : d === 0 ? 1.14 : d === 1 ? 1.07 : d === 2 ? 1.03 : 1;
    const lift = hoverIdx == null ? 0 : d === 0 ? 18 : d === 1 ? 10 : d === 2 ? 6 : 0;
    const spread = hoverIdx == null ? 0 : (i - (hoverIdx as number)) * (d === 0 ? 0 : d === 1 ? 12 : d === 2 ? 6 : 0);

    // соседи расходятся, если какая-то карта перетаскивается
    let pushApart = 0;
    if (draggingIndex != null) {
      const dist = Math.abs(i - draggingIndex);
      if (dist > 0) {
        const dir = i < draggingIndex ? -1 : 1;
        const magnitude = Math.max(0, 16 - (dist - 1) * 6); // 16, 10, 4, 0...
        pushApart = dir * magnitude;
      }
    }

    return {
      transform: `translateX(-50%) translateX(${g.baseX + spread + pushApart}px) translateY(${g.baseY - lift}px) rotate(${g.baseRot}deg) scale(${scale})`,
    };
  }

  return (
    <div
      className="pointer-events-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: "calc(84px + env(safe-area-inset-bottom) + 56px)", height: 200 }}
    >
      <div
        ref={setWrapRef}
        className="relative mx-auto w-full max-w-[96%] h-full"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHoverIdx(null)}
      >
        {hand.map((c, i) => {
          const st = cardStyle(i);
          const d = hoverIdx == null ? 99 : Math.abs(i - (hoverIdx as number));
          const z = 10 + (hoverIdx == null ? i : 100 - d * 10);

          return (
            <button
              key={i}
              className="absolute left-1/2 pointer-events-auto"
              style={{
                bottom: 0,
                transform: st.transform,
                transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease, opacity 140ms ease",
                zIndex: z,
                opacity: draggingIndex === i ? 0 : 1,
              }}
              onPointerDown={handlePointerDown(i, c)}
            >
              <CardView c={c} suitColor={suitColor} cardShadow={cardShadow} alpha={1} />
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
  alpha = 1,
}: {
  c: Card;
  suitColor: (s: Suit) => string;
  cardShadow: string;
  alpha?: number;
}) {
  const red = c.suit === "♥" || c.suit === "♦";
  return (
    <div
      className="w-[72px] h-[104px] sm:w-[80px] sm:h-[116px] rounded-2xl grid"
      style={{
        gridTemplateRows: "1fr auto 1fr",
        background: "linear-gradient(180deg, rgba(255,255,255,1), rgba(244,246,250,1))",
        border: "1px solid rgba(0,0,0,.06)",
        boxShadow: cardShadow,
        willChange: "transform",
        opacity: alpha,
      }}
    >
      <div className="p-2 text-xs font-semibold" style={{ color: suitColor(c.suit) }}>
        {c.suit}
      </div>
      <div className="grid place-items-center">
        <div className="font-extrabold tracking-wider" style={{ fontSize: 28, color: red ? "#ff5d72" : "#38d39f", textShadow: "0 1px 0 rgba(0,0,0,.15)" }}>
          {c.rank}
        </div>
      </div>
      <div className="p-2 text-xs font-semibold justify-self-end self-end" style={{ color: suitColor(c.suit) }}>
        {c.suit}
      </div>
    </div>
  );
}

function TableView({
  table,
  suitColor,
  cardShadow,
  justDefended,
  hoverDefIdx,
}: {
  table: TablePair[];
  suitColor: (s: Suit) => string;
  cardShadow: string;
  justDefended: number[];
  hoverDefIdx: number | null;
}) {
  if (!table || table.length === 0) {
    return (
      <div className="w-full h-full grid place-items-center">
        <div className="px-4 py-3 rounded-2xl text-white/80 text-sm" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}>
          Стол пуст — ждём карту.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full grid place-items-center">
      <div className="relative w-[92%] max-w-[520px] min-h-[160px]">
        {table.map((p, i) => {
          const x = (i % 3) * 120 - 120;
          const y = Math.floor(i / 3) * 130;
          const defended = !!p.d;
          const fall = justDefended.includes(i);
          const preHighlight = hoverDefIdx === i && !defended;

          return (
            <div key={i} className="absolute left-1/2" style={{ transform: `translateX(-50%) translate(${x}px, ${y}px)` }}>
              <div
                data-attack-slot="1"
                data-idx={i}
                className="rounded-[16px]"
                style={{
                  padding: defended ? 2 : 0,
                  animation: defended ? "pulseEdge 700ms ease-out" : undefined,
                  borderRadius: 16,
                  // предварительная подсветка при наведении защитной карты
                  boxShadow: preHighlight
                    ? "0 0 0 2px rgba(255,80,80,.9), 0 0 18px rgba(255,60,60,.45)"
                    : undefined,
                }}
              >
                <CardView c={p.a} suitColor={suitColor} cardShadow={cardShadow} alpha={1} />
              </div>

              {p.d && (
                <div
                  className="absolute left-[54px] top-[18px] rotate-12"
                  data-defend-slot="1"
                  data-idx={i}
                  style={{
                    // падение медленнее
                    animation: fall ? "defendFall 360ms ease-out" : undefined,
                  }}
                >
                  <CardView c={p.d} suitColor={suitColor} cardShadow={cardShadow} alpha={1} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
