"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Share cards are 1080×1080 SVGs: they scale down on screen with CSS and download as an exact 1080 PNG
// (useCardDownload). All text is monospace, so text widths are known without measuring.

export const SIZE = 1080;
export const PAD = 64;
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
/** Advance width of one monospace character, as a share of the font size. */
const CHAR = 0.6;
export const textWidth = (text: string, fontSize: number) => [...text].length * fontSize * CHAR;

export const C = {
  canvas: "#151618",
  surface: "#202226",
  border: "#383C43",
  action: "#8BACFF",
  text: "#F2F3F5",
  muted: "#ACB2BE",
  passed: "#22c55e",
};

/** 1080 square with the bug.dr top bar. `id` keeps the clip path unique on the page. */
export function CardFrame({
  id,
  stroke = C.border,
  strokeWidth = 1,
  label,
  className = "",
  svgRef,
  children,
}: {
  id: string;
  stroke?: string;
  strokeWidth?: number;
  label: string;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
  children: ReactNode;
}) {
  const inset = strokeWidth / 2;
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
      fontFamily={MONO}
      className={`block h-auto w-full ${className}`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width={SIZE} height={SIZE} rx="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={SIZE} height={SIZE} fill={C.canvas} />
        <rect width={SIZE} height="104" fill={C.surface} />
        <rect y="104" width={SIZE} height="1" fill={C.border} />
      </g>
      <rect x={inset} y={inset} width={SIZE - 2 * inset} height={SIZE - 2 * inset} rx="12" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
      <text x={PAD} y="64" fontSize="36" fontWeight="700" fill={C.text}>
        bug.dr
      </text>
      <text x={SIZE - PAD} y="62" fontSize="24" fill={C.muted} textAnchor="end">
        bugdr.app
      </text>
      {children}
    </svg>
  );
}

export const Divider = ({ y }: { y: number }) => <rect x={PAD} y={y} width={SIZE - 2 * PAD} height="1" fill={C.border} />;

/** Small uppercase label above a value. */
export const Label = ({ x, y, children, anchor }: { x: number; y: number; children: string; anchor?: "middle" }) => (
  <text x={x} y={y} fontSize="22" letterSpacing="3" fill={C.muted} textAnchor={anchor}>
    {children}
  </text>
);

/** Three label/value columns; `data-stat` lets the modals animate them in one by one. */
export function StatsRow({ y, stats }: { y: number; stats: [string, string][] }) {
  const column = (SIZE - 2 * PAD) / 3;
  return stats.map(([label, value], i) => (
    <g key={label} data-stat="">
      <Label x={PAD + i * column} y={y}>
        {label}
      </Label>
      <text x={PAD + i * column} y={y + 76} fontSize="60" fontWeight="700" fill={C.text}>
        {value}
      </text>
    </g>
  ));
}

export const reducedMotion = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 0 → target over `ms` with ease-out, starting when `start` turns true. Jumps straight there with reduced motion. */
export function useCountUp(target: number, ms: number, start = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) {
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let id = 0;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / ms)); // the first frame can be stamped before t0
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, ms, start]);
  return value;
}

/**
 * Particles flying out from (x, y) in viewport px, falling with gravity and fading. They live in `layer`
 * (a fixed, overflow-hidden box over the viewport), so they never leave the screen or cause scrolling.
 */
export function burst(
  layer: HTMLElement,
  x: number,
  y: number,
  { count, colors, size, distance, ms }: { count: number; colors: string[]; size: number; distance: [number, number]; ms: number },
) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const d = distance[0] + Math.random() * (distance[1] - distance[0]);
    const dx = Math.cos(angle) * d;
    const dy = Math.sin(angle) * d;
    const turn = (Math.random() - 0.5) * 1080;
    Object.assign(p.style, {
      position: "absolute",
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      background: colors[i % colors.length],
      borderRadius: "1px",
      pointerEvents: "none",
    });
    layer.append(p);
    p.animate(
      [
        // Per-segment easing: fly out fast and slow down, then fall (speeding up) while fading.
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1, easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
        { transform: `translate(${dx}px, ${dy}px) rotate(${turn / 2}deg)`, opacity: 1, offset: 0.45, easing: "ease-in" },
        { transform: `translate(${dx * 1.15}px, ${dy + 140}px) rotate(${turn}deg)`, opacity: 0 },
      ],
      { duration: ms, fill: "forwards" },
    ).finished.then(() => p.remove(), () => p.remove());
  }
}

/** Fade/slide in with WAAPI, a no-op with reduced motion (the element just shows). */
export function enter(el: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  if (!el || reducedMotion()) return;
  el.animate(keyframes, { fill: "backwards", ...options });
}

/** Spring-like overshoot for slide/scale-in. */
export const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * Fullscreen celebration on the native <dialog> (Esc, focus trap): a dark backdrop that fades in, the content
 * centered (scrolls on short screens) and a particle layer on top. Clicking the backdrop closes it.
 */
export function CelebrationDialog({
  label,
  backdrop,
  onClose,
  onOpen,
  children,
}: {
  label: string;
  /** Backdrop opacity, 0-1. */
  backdrop: number;
  onClose: () => void;
  /** Runs once the dialog is open, with the particle layer; may return a cleanup. */
  onOpen: (layer: HTMLDivElement) => void | (() => void);
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(onOpen);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const layer = layerRef.current!;
    if (!dialog.open) dialog.showModal();
    enter(backdropRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    const cleanup = openRef.current(layer);
    return () => {
      cleanup?.();
      layer.replaceChildren();
    };
  }, []);

  const closeOnSelf = (e: React.MouseEvent) => e.target === e.currentTarget && onClose();
  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-transparent p-0 text-text backdrop:bg-transparent"
    >
      <div ref={backdropRef} className="fixed inset-0" style={{ background: `rgba(10, 10, 10, ${backdrop})` }} />
      <div onClick={closeOnSelf} className="relative flex min-h-full flex-col items-center justify-center px-4 py-8">
        {children}
      </div>
      <div ref={layerRef} aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" />
    </dialog>
  );
}
