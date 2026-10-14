"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { GlassButton } from "@/components/ui";
import WaitlistModal from "@/components/WaitlistModal";

type Panel = { x: string; y: string; w: number; h: number; speed: number };

// speed = vh per 60 fps frame; y is the server-rendered start, replaced by a random one on mount.
const LAYERS: { panels: Panel[]; className: string; tilt: { x: number; y: number } }[] = [
  {
    className: "blur-[2px] opacity-[0.35]",
    tilt: { x: 1, y: 1.5 },
    panels: [
      { x: "8%", y: "15%", w: 260, h: 180, speed: 0.012 },
      { x: "72%", y: "55%", w: 220, h: 160, speed: 0.009 },
      { x: "40%", y: "80%", w: 200, h: 150, speed: 0.011 },
      { x: "85%", y: "20%", w: 180, h: 140, speed: 0.008 },
      { x: "20%", y: "65%", w: 240, h: 170, speed: 0.01 },
      { x: "58%", y: "35%", w: 190, h: 145, speed: 0.013 },
      { x: "5%", y: "45%", w: 170, h: 130, speed: 0.007 },
      { x: "92%", y: "70%", w: 210, h: 155, speed: 0.009 },
    ],
  },
  {
    className: "blur-[1px] opacity-[0.55]",
    tilt: { x: 2, y: 3 },
    panels: [
      { x: "15%", y: "30%", w: 300, h: 200, speed: 0.018 },
      { x: "65%", y: "10%", w: 270, h: 185, speed: 0.022 },
      { x: "35%", y: "60%", w: 250, h: 175, speed: 0.016 },
      { x: "80%", y: "45%", w: 230, h: 165, speed: 0.02 },
      { x: "50%", y: "85%", w: 280, h: 190, speed: 0.019 },
      { x: "5%", y: "75%", w: 240, h: 170, speed: 0.015 },
      { x: "90%", y: "30%", w: 260, h: 180, speed: 0.021 },
    ],
  },
  {
    className: "opacity-[0.70]",
    tilt: { x: 4, y: 6 },
    panels: [
      { x: "25%", y: "20%", w: 320, h: 220, speed: 0.03 },
      { x: "60%", y: "55%", w: 290, h: 200, speed: 0.028 },
      { x: "10%", y: "60%", w: 310, h: 215, speed: 0.032 },
      { x: "75%", y: "15%", w: 340, h: 230, speed: 0.027 },
      { x: "42%", y: "40%", w: 300, h: 210, speed: 0.031 },
      { x: "88%", y: "75%", w: 270, h: 185, speed: 0.029 },
      { x: "30%", y: "85%", w: 330, h: 225, speed: 0.026 },
    ],
  },
];

const K = "text-[#c084fc]"; // keyword
const S = "text-[#fbbf24]"; // string
const F = "text-[#93c5fd]"; // function
const C = "text-[#6b7280]"; // comment
const T = "text-[#5eead4]"; // type

function CodePanel() {
  return (
    <pre className="p-4 font-mono text-[11px] leading-[1.7] text-muted">
      <span className={C}>{"// retry failed charges"}</span>
      {"\n"}
      <span className={K}>async function</span> <span className={F}>retry</span>(id: <span className={T}>string</span>) {"{"}
      {"\n  "}
      <span className={K}>const</span> job = <span className={K}>await</span> <span className={F}>queue</span>(
      <span className={S}>&quot;payments&quot;</span>);
      {"\n  "}
      <span className={K}>if</span> (!job) <span className={K}>return</span> <span className={K}>null</span>;
      {"\n  "}
      <span className={K}>return</span> job.<span className={F}>run</span>(id);
    </pre>
  );
}

function TerminalPanel() {
  const lines = ["reading payments/retry.ts", "queue returns null on timeout", "retry never re-enqueues", "patching retry()"];
  return (
    <div className="font-mono text-[11px] leading-[1.7]">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-failed/70" />
        <span className="h-2 w-2 rounded-full bg-pending/70" />
        <span className="h-2 w-2 rounded-full bg-passed/70" />
        <span className="ml-2 text-muted2">agent</span>
      </div>
      <div className="px-3 py-2 text-muted">
        {lines.map((l) => (
          <div key={l} className="truncate">
            <span className="text-action">◆</span> {l}
          </div>
        ))}
        <div>
          <span className="text-action">◆</span> 4/4 checks passing<span className="animate-pulse-dot text-text">|</span>
        </div>
      </div>
    </div>
  );
}

function SolvePanel() {
  return (
    <div className="flex h-full flex-col gap-3 p-4 font-mono text-[11px]">
      <span className="font-semibold tracking-wide text-passed">✓ SOLVED</span>
      <div className="text-muted">
        time <span className="text-text">08:42</span>
      </div>
      <span className="w-fit rounded-md border border-action/30 bg-action/10 px-2 py-0.5 text-action">efficiency 1.6×</span>
    </div>
  );
}

const CONTENT: (() => ReactNode)[] = [CodePanel, TerminalPanel, SolvePanel];

function FloatingPanels({ hero }: { hero: RefObject<HTMLElement | null> }) {
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const panels = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const all = LAYERS.flatMap((l) => l.panels);
    const ys = all.map(() => -20 + Math.random() * 140);
    const target = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };
    const el = hero.current;
    const onMove = (e: MouseEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    el?.addEventListener("mousemove", onMove);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / (1000 / 60), 4); // frames since last tick; capped after a background tab
      last = now;
      all.forEach((p, i) => {
        ys[i] -= p.speed * dt;
        if (ys[i] < -25) ys[i] = 120;
        const node = panels.current[i];
        if (node) node.style.transform = `translateY(${ys[i]}vh)`;
      });
      tilt.x += (target.x - tilt.x) * 0.06;
      tilt.y += (target.y - tilt.y) * 0.06;
      LAYERS.forEach((l, i) => {
        const node = layers.current[i];
        if (node) node.style.transform = `rotateX(${-tilt.y * l.tilt.x}deg) rotateY(${tilt.x * l.tilt.y}deg)`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el?.removeEventListener("mousemove", onMove);
    };
  }, [hero]);

  let index = 0;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 [perspective:1200px]">
      {LAYERS.map((layer, li) => (
        <div
          key={li}
          ref={(n) => {
            layers.current[li] = n;
          }}
          className={`absolute inset-0 ${layer.className}`}
        >
          {layer.panels.map((p) => {
            const i = index++;
            const Content = CONTENT[i % 3];
            return (
              <div
                key={i}
                ref={(n) => {
                  panels.current[i] = n;
                }}
                className="absolute top-0 overflow-hidden rounded-[12px] border border-white/[0.07] bg-white/[0.03] shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-[8px]"
                style={{ left: p.x, width: p.w, height: p.h, marginLeft: -p.w / 2, transform: `translateY(${p.y})` }}
              >
                <Content />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function HeroSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const hero = useRef<HTMLElement>(null);

  return (
    <section
      ref={hero}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4"
    >
      <FloatingPanels hero={hero} />
      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-center font-display font-extrabold leading-[1.1] tracking-[-0.03em] text-text [font-size:clamp(2.4rem,5vw,4.8rem)]">
          Your title
          <br />
          doesn&apos;t fix bugs.
        </h1>
        <p className="mt-4 max-w-[500px] text-center leading-relaxed text-muted [font-size:clamp(1rem,1.8vw,1.2rem)]">
          Real production bugs. AI available.
          <br />
          Prove you can ship.
        </p>
        <GlassButton variant="action" size="lg" className="mt-8" onClick={() => setModalOpen(true)}>
          Get early access
        </GlassButton>
      </div>
      <WaitlistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
