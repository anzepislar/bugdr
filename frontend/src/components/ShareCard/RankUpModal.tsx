"use client";

import { useEffect, useRef, useState } from "react";
import { getRankColor, RankBadge } from "@/components/RankBadge";
import { useCardDownload } from "@/hooks/useCardDownload";
import { RankUpCard, type RankUpCardProps } from "./RankUpCard";
import { burst, CelebrationDialog, enter, reducedMotion, SPRING, useCountUp } from "./shared";

const TITLE = "RANKED UP";
// Timeline (ms): badge springs in → "RANKED UP" types → rank name → card slides up → stats count → buttons.
const T = { type: 600, name: 1050, card: 1350, count: 1700, countMs: 1000, buttons: 2700 };

/** After a solve that crossed a level threshold. Bigger than SolveModal: badge burst, typed title, then the card. */
export function RankUpModal({ card, onClose }: { card: Omit<RankUpCardProps, "className" | "svgRef">; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLParagraphElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const { download } = useCardDownload(svgRef);
  const [typed, setTyped] = useState(0);
  const [counting, setCounting] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const problems = useCountUp(card.problemsSolved, T.countMs, counting);
  const points = useCountUp(card.totalPoints, T.countMs, counting);
  const streak = useCountUp(card.currentStreak, T.countMs, counting);

  // "RANKED UP" types itself over ~0.4 s once the badge settles.
  useEffect(() => {
    if (typed >= TITLE.length) return;
    const id = setTimeout(() => setTyped((n) => n + 1), typed === 0 && !reducedMotion() ? T.type : 45);
    return () => clearTimeout(id);
  }, [typed]);

  function onOpen(layer: HTMLDivElement) {
    const quick = reducedMotion();
    enter(badgeRef.current, [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.2)", opacity: 1, offset: 0.6 }, { transform: "scale(1)" }], {
      duration: 600,
      easing: SPRING,
    });
    const timers = [
      setTimeout(() => {
        const box = badgeRef.current!.getBoundingClientRect();
        burst(layer, box.left + box.width / 2, box.top + box.height / 2, {
          count: 60,
          colors: ["#fbbf24", "#f59e0b", "#F2F3F5"],
          size: 6,
          distance: [150, 300],
          ms: 1500,
        });
      }, 250),
      setTimeout(() => setCounting(true), quick ? 0 : T.count),
      setTimeout(() => setReady(true), quick ? 0 : T.count + T.countMs),
    ];
    enter(nameRef.current, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: T.name });
    enter(cardRef.current, [{ transform: "translateY(100px)", opacity: 0 }, { transform: "none", opacity: 1 }], {
      duration: 600,
      delay: T.card,
      easing: SPRING,
    });
    enter(buttonsRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: T.buttons });
    return () => timers.forEach(clearTimeout);
  }

  async function save() {
    setMessage(null);
    try {
      await download(`bugdr-${card.newRank.toLowerCase()}.png`);
    } catch {
      setMessage({ text: "Could not create the image. Try again.", error: true });
    }
  }

  async function copyTweet() {
    const text =
      `Just reached ${card.newRank} on bug.dr 🐛 Fixed real production bugs using AI — ` +
      `${card.problemsSolved} problems solved, ${card.totalPoints.toLocaleString("en-US")} pts. bugdr.app #bugdr`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: "Tweet copied - paste it on Twitter.", error: false });
    } catch {
      setMessage({ text: "Could not copy to the clipboard.", error: true });
    }
  }

  return (
    <CelebrationDialog label={`Ranked up to ${card.newRank}`} backdrop={0.92} onClose={onClose} onOpen={onOpen}>
      <div ref={badgeRef} className="relative">
        <RankBadge rank={card.newRank} size={104} />
      </div>
      <p className="relative mt-4 h-4 font-mono text-xs tracking-[0.3em] text-muted" aria-label={TITLE}>
        {TITLE.slice(0, typed)}
      </p>
      <p ref={nameRef} className="relative mt-1 text-3xl font-bold" style={{ color: getRankColor(card.newRank) }}>
        {card.newRank}
      </p>
      <div ref={cardRef} className="relative mt-6 w-[min(100%,24rem,42dvh)]">
        <RankUpCard
          {...card}
          problemsSolved={Math.round(problems)}
          totalPoints={Math.round(points)}
          currentStreak={Math.round(streak)}
          svgRef={svgRef}
          className="rounded-xl"
        />
      </div>
      <div ref={buttonsRef} className="relative mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!ready}
          className="rounded bg-action px-5 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-60"
        >
          Download your rank card
        </button>
        <button type="button" onClick={copyTweet} className="rounded border border-action px-5 py-2 text-sm text-action hover:bg-action/10">
          Share on Twitter
        </button>
        <button type="button" onClick={onClose} className="rounded border border-border px-5 py-2 text-sm text-muted hover:border-action hover:text-text">
          Continue debugging
        </button>
      </div>
      {message ? (
        <p role={message.error ? "alert" : "status"} className={`relative mt-3 text-sm ${message.error ? "text-failed" : "text-passed"}`}>
          {message.text}
        </p>
      ) : null}
    </CelebrationDialog>
  );
}
