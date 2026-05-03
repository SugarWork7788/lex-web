"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type WheelEvent as RWheelEvent,
} from "react";

// ─── Data model ─────────────────────────────────────────────────────────────
type NodeKind = "constitution" | "court" | "law" | "branch" | "eu";

type Node = {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  href?: string;
  x: number;
  y: number;
  /** Width / height of the node card. */
  w: number;
  h: number;
};

type Edge = {
  from: string;
  to: string;
  /** Visual style — dashed = soft / overlay relationship. */
  style?: "solid" | "dashed";
};

// Layout coordinates chosen for visual clarity, not auto-computed.
// viewBox is set to fit all of these with margin.
const NODES: Node[] = [
  // ── EU overlay (top, dashed connections to branches) ─────────────────────
  {
    id: "eu",
    kind: "eu",
    label: "ЕС право",
    sub: "EUR-Lex · регламенти и директиви",
    href: "/eu",
    x: 0,
    y: -460,
    w: 220,
    h: 60,
  },
  // ── Top row: Constitutional Court + Constitution ─────────────────────────
  {
    id: "ks",
    kind: "court",
    label: "КС",
    sub: "Конституционен съд",
    href: "/courts/ks",
    x: -380,
    y: -260,
    w: 150,
    h: 56,
  },
  {
    id: "constitution",
    kind: "constitution",
    label: "Конституция на РБ",
    sub: "Основният закон",
    href: "/laws/konstitutsiya-na-republika-balgariya",
    x: 0,
    y: -260,
    w: 240,
    h: 70,
  },
  // ── Branch headings (4 across) ──────────────────────────────────────────
  { id: "br_civil",      kind: "branch", label: "Гражданско право",       x: -540, y: -60, w: 180, h: 46 },
  { id: "br_criminal",   kind: "branch", label: "Наказателно право",      x: -180, y: -60, w: 180, h: 46 },
  { id: "br_admin",      kind: "branch", label: "Административно право", x:  180, y: -60, w: 200, h: 46 },
  { id: "br_commercial", kind: "branch", label: "Търговско право",        x:  540, y: -60, w: 180, h: 46 },
  // ── Laws under each branch ───────────────────────────────────────────────
  // Civil
  {
    id: "law_gpk",
    kind: "law",
    label: "ГПК",
    sub: "Граждански процесуален кодекс",
    href: "/laws/grazhdanski-protsesualen-kodeks",
    x: -620, y: 80, w: 130, h: 50,
  },
  {
    id: "law_zzd",
    kind: "law",
    label: "ЗЗД",
    sub: "Закон за задълженията и договорите",
    href: "/laws/zakon-za-zadalzheniyata-i-dogovorite",
    x: -460, y: 80, w: 130, h: 50,
  },
  {
    id: "law_sk",
    kind: "law",
    label: "СК",
    sub: "Семеен кодекс",
    href: "/laws/semeen-kodeks",
    x: -620, y: 160, w: 130, h: 50,
  },
  {
    id: "law_zs",
    kind: "law",
    label: "ЗС",
    sub: "Закон за собствеността",
    href: "/laws/zakon-za-sobstvenostta",
    x: -460, y: 160, w: 130, h: 50,
  },
  // Criminal
  {
    id: "law_nk",
    kind: "law",
    label: "НК",
    sub: "Наказателен кодекс",
    href: "/laws/nakazatelen-kodeks",
    x: -250, y: 80, w: 130, h: 50,
  },
  {
    id: "law_npk",
    kind: "law",
    label: "НПК",
    sub: "Наказателно-процесуален кодекс",
    href: "/laws/nakazatelno-protsesualen-kodeks",
    x: -110, y: 80, w: 130, h: 50,
  },
  // Administrative
  {
    id: "law_apk",
    kind: "law",
    label: "АПК",
    sub: "Административнопроцесуален кодекс",
    href: "/laws/administrativnoprotsesualen-kodeks",
    x: 110, y: 80, w: 130, h: 50,
  },
  {
    id: "law_dopk",
    kind: "law",
    label: "ДОПК",
    sub: "Данъчно-осигурителен процесуален кодекс",
    href: "/laws/danachno-osiguritelen-protsesualen-kodeks",
    x: 250, y: 80, w: 130, h: 50,
  },
  {
    id: "law_zut",
    kind: "law",
    label: "ЗУТ",
    sub: "Закон за устройство на територията",
    href: "/laws/zakon-za-ustroystvo-na-teritoriyata",
    x: 180, y: 160, w: 130, h: 50,
  },
  // Commercial
  {
    id: "law_tz",
    kind: "law",
    label: "ТЗ",
    sub: "Търговски закон",
    href: "/search?q=%D0%A2%D1%8A%D1%80%D0%B3%D0%BE%D0%B2%D1%81%D0%BA%D0%B8+%D0%B7%D0%B0%D0%BA%D0%BE%D0%BD&tab=laws",
    x: 470, y: 80, w: 130, h: 50,
  },
  {
    id: "law_zbn",
    kind: "law",
    label: "ЗБН",
    sub: "Закон за банковата несъстоятелност",
    href: "/search?q=%D0%B1%D0%B0%D0%BD%D0%BA%D0%BE%D0%B2%D0%B0%D1%82%D0%B0+%D0%BD%D0%B5%D1%81%D1%8A%D1%81%D1%82%D0%BE%D1%8F%D1%82%D0%B5%D0%BB%D0%BD%D0%BE%D1%81%D1%82&tab=laws",
    x: 610, y: 80, w: 130, h: 50,
  },
  // ── Courts (bottom) ──────────────────────────────────────────────────────
  {
    id: "vks",
    kind: "court",
    label: "ВКС",
    sub: "Върховен касационен съд",
    href: "/courts/vks",
    x: -180,
    y: 320,
    w: 200,
    h: 60,
  },
  {
    id: "vas",
    kind: "court",
    label: "ВАС",
    sub: "Върховен административен съд",
    href: "/courts/vas",
    x: 180,
    y: 320,
    w: 220,
    h: 60,
  },
];

const EDGES: Edge[] = [
  // Constitution → branches + KC
  { from: "constitution", to: "ks" },
  { from: "constitution", to: "br_civil" },
  { from: "constitution", to: "br_criminal" },
  { from: "constitution", to: "br_admin" },
  { from: "constitution", to: "br_commercial" },
  // EU overlay (dashed) — touches each branch + Constitution
  { from: "eu", to: "constitution", style: "dashed" },
  { from: "eu", to: "br_civil",      style: "dashed" },
  { from: "eu", to: "br_criminal",   style: "dashed" },
  { from: "eu", to: "br_admin",      style: "dashed" },
  { from: "eu", to: "br_commercial", style: "dashed" },
  // Branch → its laws
  { from: "br_civil", to: "law_gpk" },
  { from: "br_civil", to: "law_zzd" },
  { from: "br_civil", to: "law_sk" },
  { from: "br_civil", to: "law_zs" },
  { from: "br_criminal", to: "law_nk" },
  { from: "br_criminal", to: "law_npk" },
  { from: "br_admin", to: "law_apk" },
  { from: "br_admin", to: "law_dopk" },
  { from: "br_admin", to: "law_zut" },
  { from: "br_commercial", to: "law_tz" },
  { from: "br_commercial", to: "law_zbn" },
  // Branch → court (which body adjudicates this area)
  { from: "br_civil",      to: "vks" },
  { from: "br_criminal",   to: "vks" },
  { from: "br_admin",      to: "vas" },
  { from: "br_commercial", to: "vks" },
];

const NODE_BY_ID: Record<string, Node> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
);

// ─── Visual styling per node kind ───────────────────────────────────────────
const STYLES: Record<
  NodeKind,
  {
    fill: string;
    stroke: string;
    text: string;
    sub: string;
    hoverStroke: string;
  }
> = {
  constitution: {
    fill: "#1e1410",
    stroke: "#d97706",
    text: "#fef3c7",
    sub: "#fbbf24",
    hoverStroke: "#fbbf24",
  },
  court: {
    fill: "#0f1428",
    stroke: "#6366f1",
    text: "#e0e7ff",
    sub: "#a5b4fc",
    hoverStroke: "#a5b4fc",
  },
  law: {
    fill: "#1c1812",
    stroke: "#b45309",
    text: "#fde68a",
    sub: "#fbbf24",
    hoverStroke: "#fcd34d",
  },
  branch: {
    fill: "#16151a",
    stroke: "#52525b",
    text: "#e7e5e4",
    sub: "#a8a29e",
    hoverStroke: "#a8a29e",
  },
  eu: {
    fill: "#1f1c0a",
    stroke: "#eab308",
    text: "#fef9c3",
    sub: "#fde047",
    hoverStroke: "#fde047",
  },
};

// ─── Layout & viewBox ───────────────────────────────────────────────────────
const VIEW_BOX = { x: -780, y: -540, w: 1560, h: 1000 };

function nodeAnchor(n: Node, towardX: number, towardY: number) {
  // Edge intersection on the node's bounding rect, so connector lines start/
  // end at the rectangle border instead of disappearing under the node body.
  const dx = towardX - n.x;
  const dy = towardY - n.y;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  const halfW = n.w / 2;
  const halfH = n.h / 2;
  const tx = halfW / Math.abs(dx);
  const ty = halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: n.x + dx * t, y: n.y + dy * t };
}

function curvePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  // Slight S-curve via cubic Bezier so crossing lines don't all overlap visually.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const c1x = mx;
  const c1y = a.y;
  const c2x = mx;
  const c2y = b.y;
  return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
}

// ─── The component ──────────────────────────────────────────────────────────
type View = { tx: number; ty: number; scale: number };

const INITIAL_VIEW: View = { tx: 0, ty: 0, scale: 1 };
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export function LegalMap() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    lastDistance: number | null;
    panStart: View | null;
    pointerStart: { x: number; y: number } | null;
  }>({ pointers: new Map(), lastDistance: null, panStart: null, pointerStart: null });

  // Convert client coords → viewBox coords (post-pan/zoom). Used so wheel
  // zoom keeps the cursor over the same logical point.
  const screenToView = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      const vbX = VIEW_BOX.x + px * VIEW_BOX.w;
      const vbY = VIEW_BOX.y + py * VIEW_BOX.h;
      // Inverse of the group transform: g_x = (vb_x - tx) / scale
      const gx = (vbX - view.tx) / view.scale;
      const gy = (vbY - view.ty) / view.scale;
      return { x: gx, y: gy };
    },
    [view],
  );

  const onWheel = useCallback(
    (e: RWheelEvent<SVGSVGElement>) => {
      // SVG onWheel listeners are passive by default in React 19 — we cannot
      // call preventDefault here. The window-level non-passive listener
      // installed in useEffect below blocks the page from scrolling instead.
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const realFactor = newScale / v.scale;
        // Keep the point under the cursor stable.
        const svg = svgRef.current;
        if (!svg) return { ...v, scale: newScale };
        const rect = svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const vbX = VIEW_BOX.x + px * VIEW_BOX.w;
        const vbY = VIEW_BOX.y + py * VIEW_BOX.h;
        return {
          tx: vbX - (vbX - v.tx) * realFactor,
          ty: vbY - (vbY - v.ty) * realFactor,
          scale: newScale,
        };
      });
    },
    [],
  );

  // Block page scroll while the wheel is over the SVG.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  const onPointerDown = useCallback(
    (e: RPointerEvent<SVGSVGElement>) => {
      const target = e.target as Element;
      // Don't start a pan when clicking a node — let the link click through.
      if (target.closest("[data-node]")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
      if (dragRef.current.pointers.size === 1) {
        dragRef.current.panStart = view;
        dragRef.current.pointerStart = { x: e.clientX, y: e.clientY };
      } else if (dragRef.current.pointers.size === 2) {
        const pts = Array.from(dragRef.current.pointers.values());
        dragRef.current.lastDistance = Math.hypot(
          pts[0].x - pts[1].x,
          pts[0].y - pts[1].y,
        );
      }
    },
    [view],
  );

  const onPointerMove = useCallback(
    (e: RPointerEvent<SVGSVGElement>) => {
      if (!dragRef.current.pointers.has(e.pointerId)) return;
      dragRef.current.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });

      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();

      if (dragRef.current.pointers.size === 1 && dragRef.current.panStart && dragRef.current.pointerStart) {
        const dx = e.clientX - dragRef.current.pointerStart.x;
        const dy = e.clientY - dragRef.current.pointerStart.y;
        // Convert pixel delta to viewBox-space delta.
        const vbDx = (dx / rect.width) * VIEW_BOX.w;
        const vbDy = (dy / rect.height) * VIEW_BOX.h;
        setView({
          ...dragRef.current.panStart,
          tx: dragRef.current.panStart.tx + vbDx,
          ty: dragRef.current.panStart.ty + vbDy,
        });
      } else if (dragRef.current.pointers.size === 2 && dragRef.current.lastDistance) {
        const pts = Array.from(dragRef.current.pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const factor = dist / dragRef.current.lastDistance;
        dragRef.current.lastDistance = dist;
        // Pinch around midpoint of the two fingers.
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const px = (midX - rect.left) / rect.width;
        const py = (midY - rect.top) / rect.height;
        const vbX = VIEW_BOX.x + px * VIEW_BOX.w;
        const vbY = VIEW_BOX.y + py * VIEW_BOX.h;
        setView((v) => {
          const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
          const realFactor = newScale / v.scale;
          return {
            tx: vbX - (vbX - v.tx) * realFactor,
            ty: vbY - (vbY - v.ty) * realFactor,
            scale: newScale,
          };
        });
      }
    },
    [],
  );

  const onPointerUp = useCallback((e: RPointerEvent<SVGSVGElement>) => {
    dragRef.current.pointers.delete(e.pointerId);
    if (dragRef.current.pointers.size < 2) {
      dragRef.current.lastDistance = null;
    }
    if (dragRef.current.pointers.size === 0) {
      dragRef.current.panStart = null;
      dragRef.current.pointerStart = null;
    } else if (dragRef.current.pointers.size === 1) {
      // Continue panning with the remaining finger.
      const remaining = Array.from(dragRef.current.pointers.values())[0];
      dragRef.current.panStart = view;
      dragRef.current.pointerStart = { x: remaining.x, y: remaining.y };
    }
  }, [view]);

  const reset = useCallback(() => setView(INITIAL_VIEW), []);
  const zoomIn = useCallback(
    () => setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.25) })),
    [],
  );
  const zoomOut = useCallback(
    () => setView((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.25) })),
    [],
  );

  const edges = useMemo(
    () =>
      EDGES.map((e) => {
        const from = NODE_BY_ID[e.from];
        const to = NODE_BY_ID[e.to];
        if (!from || !to) return null;
        const a = nodeAnchor(from, to.x, to.y);
        const b = nodeAnchor(to, from.x, from.y);
        return { ...e, a, b };
      }).filter((x): x is NonNullable<typeof x> => Boolean(x)),
    [],
  );

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-stone-800 bg-stone-950 shadow-lg">
      <svg
        ref={svgRef}
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.w} ${VIEW_BOX.h}`}
        className="block w-full h-[70vh] min-h-[500px] max-h-[800px] cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label="Карта на българската правна система"
      >
        <defs>
          <radialGradient id="bgGrad" cx="50%" cy="40%" r="80%">
            <stop offset="0%" stopColor="#1c1917" stopOpacity="1" />
            <stop offset="100%" stopColor="#0c0a09" stopOpacity="1" />
          </radialGradient>
          <pattern
            id="grid"
            x="0"
            y="0"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke="#27272a"
              strokeWidth="0.5"
              opacity="0.3"
            />
          </pattern>
        </defs>

        <rect
          x={VIEW_BOX.x}
          y={VIEW_BOX.y}
          width={VIEW_BOX.w}
          height={VIEW_BOX.h}
          fill="url(#bgGrad)"
        />
        <rect
          x={VIEW_BOX.x}
          y={VIEW_BOX.y}
          width={VIEW_BOX.w}
          height={VIEW_BOX.h}
          fill="url(#grid)"
        />

        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {/* Edges first (under nodes) */}
          {edges.map((e, i) => (
            <path
              key={`e-${i}`}
              d={curvePath(e.a, e.b)}
              fill="none"
              stroke={e.style === "dashed" ? "#854d0e" : "#3f3f46"}
              strokeWidth={1.6}
              strokeDasharray={e.style === "dashed" ? "6 4" : undefined}
              opacity={
                hovered &&
                hovered !== e.from &&
                hovered !== e.to
                  ? 0.25
                  : 0.85
              }
            />
          ))}

          {/* Nodes */}
          {NODES.map((n) => {
            const s = STYLES[n.kind];
            const isHover = hovered === n.id;
            const Wrapper = ({ children }: { children: React.ReactNode }) =>
              n.href ? (
                <Link href={n.href} aria-label={n.sub ?? n.label}>
                  {children}
                </Link>
              ) : (
                <g>{children}</g>
              );
            return (
              <Wrapper key={n.id}>
                <g
                  data-node
                  transform={`translate(${n.x} ${n.y})`}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                  className={n.href ? "cursor-pointer" : undefined}
                  style={{ transition: "transform 0.15s ease" }}
                >
                  {/* Glow ring on hover */}
                  {isHover && (
                    <rect
                      x={-n.w / 2 - 6}
                      y={-n.h / 2 - 6}
                      width={n.w + 12}
                      height={n.h + 12}
                      rx={14}
                      ry={14}
                      fill="none"
                      stroke={s.hoverStroke}
                      strokeWidth={2}
                      opacity={0.6}
                    />
                  )}
                  <rect
                    x={-n.w / 2}
                    y={-n.h / 2}
                    width={n.w}
                    height={n.h}
                    rx={10}
                    ry={10}
                    fill={s.fill}
                    stroke={s.stroke}
                    strokeWidth={n.kind === "constitution" ? 2.4 : 1.6}
                  />
                  <text
                    x={0}
                    y={n.sub ? -4 : 5}
                    textAnchor="middle"
                    fill={s.text}
                    fontSize={
                      n.kind === "constitution"
                        ? 18
                        : n.kind === "law"
                          ? 18
                          : 15
                    }
                    fontWeight={n.kind === "branch" ? 500 : 700}
                    style={{
                      fontFamily:
                        "var(--font-serif), ui-serif, Georgia, serif",
                      letterSpacing: 0.2,
                    }}
                  >
                    {n.label}
                  </text>
                  {n.sub && (
                    <text
                      x={0}
                      y={14}
                      textAnchor="middle"
                      fill={s.sub}
                      fontSize={n.kind === "law" ? 9 : 10}
                      style={{
                        fontFamily: "var(--font-sans), system-ui, sans-serif",
                      }}
                    >
                      {truncate(n.sub, n.kind === "law" ? 30 : 36)}
                    </text>
                  )}
                </g>
              </Wrapper>
            );
          })}
        </g>
      </svg>

      {/* Controls overlay */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5 rounded-md border border-stone-700 bg-stone-900/85 p-1 backdrop-blur">
        <ControlButton onClick={zoomIn} label="Приближи">+</ControlButton>
        <ControlButton onClick={zoomOut} label="Отдалечи">−</ControlButton>
        <ControlButton onClick={reset} label="Възстанови">⌂</ControlButton>
      </div>

      <Legend />
      <Hint />
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded text-base font-medium text-stone-200 hover:bg-stone-800 hover:text-amber-400"
    >
      {children}
    </button>
  );
}

function Legend() {
  const items: { kind: NodeKind; label: string }[] = [
    { kind: "constitution", label: "Конституция" },
    { kind: "law", label: "Закон / кодекс" },
    { kind: "court", label: "Съд" },
    { kind: "branch", label: "Област на правото" },
    { kind: "eu", label: "ЕС право" },
  ];
  return (
    <div className="absolute bottom-3 left-3 rounded-md border border-stone-700 bg-stone-900/85 px-3 py-2 text-[11px] backdrop-blur">
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
        {items.map((it) => {
          const s = STYLES[it.kind];
          return (
            <li key={it.kind} className="flex items-center gap-1.5 text-stone-300">
              <span
                className="inline-block h-3 w-4 rounded border"
                style={{ background: s.fill, borderColor: s.stroke }}
              />
              {it.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Hint() {
  return (
    <p className="absolute bottom-3 right-3 hidden rounded-md border border-stone-700 bg-stone-900/85 px-2.5 py-1 text-[11px] text-stone-400 backdrop-blur sm:block">
      Влачи за движение · колелце за zoom · клик върху възел за отваряне
    </p>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
