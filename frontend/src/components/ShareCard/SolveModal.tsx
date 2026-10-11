"use client";

import { useRef, useState } from "react";
import { useCardDownload } from "@/hooks/useCardDownload";
import { ProblemSolvedCard, type ProblemSolvedCardProps } from "./ProblemSolvedCard";
import { burst, CelebrationDialog, enter, reducedMotion, SPRING, useCountUp } from "./shared";

const COUNT_MS = 1200;

/** After a solve: the share card slides up with a confetti burst, the score counts up, then the download pulses. */
export function SolveModal({ card, onClose }: { card: Omit<ProblemSolvedCardProps, "className" | "svgRef">; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);
  const { download } = useCardDownload(svgRef);
  const score = useCountUp(card.efficiencyScore, COUNT_MS);
  // The PNG is taken from the card on screen, so it waits for the final numbers.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  function onOpen(layer: HTMLDivElement) {
    const box = cardRef.current!.getBoundingClientRect();
    burst(layer, box.left + box.width / 2, box.top, {
      count: 40,
      colors: ["#8BACFF", "#22c55e", "#f59e0b", "#f97316"],
      size: 4,
      distance: [80, 200],
      ms: 1200,
    });
    enter(cardRef.current, [{ transform: "translateY(100px)", opacity: 0 }, { transform: "none", opacity: 1 }], {
      duration: 600,
      easing: SPRING,
    });
    svgRef.current!.querySelectorAll("[data-stat]").forEach((el, i) =>
      enter(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 400 + i * 100 }),
    );
    const timer = setTimeout(
      () => {
        setReady(true);
        if (!reducedMotion())
          downloadRef.current?.animate(
            [
              { transform: "scale(1)", boxShadow: "0 0 0 rgba(139, 172, 255, 0)" },
              { transform: "scale(1.05)", boxShadow: "0 0 24px rgba(139, 172, 255, 0.45)" },
              { transform: "scale(1)", boxShadow: "0 0 0 rgba(139, 172, 255, 0)" },
            ],
            { duration: 600, easing: "ease-in-out" },
          );
      },
      reducedMotion() ? 0 : COUNT_MS,
    );
    return () => clearTimeout(timer);
  }

  async function save() {
    setError("");
    try {
      await download("bugdr-solved.png");
    } catch {
      setError("Could not create the image. Try again.");
    }
  }

  return (
    <CelebrationDialog label="Problem solved" backdrop={0.85} onClose={onClose} onOpen={onOpen}>
      <div ref={cardRef} className="relative w-[min(100%,28rem,58dvh)]">
        <ProblemSolvedCard {...card} efficiencyScore={score} svgRef={svgRef} className="rounded-xl" />
      </div>
      <div className="relative mt-6 flex flex-wrap justify-center gap-3">
        <button
          ref={downloadRef}
          type="button"
          onClick={save}
          disabled={!ready}
          className="rounded bg-action px-5 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-60"
        >
          Download card
        </button>
        <button type="button" onClick={onClose} className="rounded border border-border px-5 py-2 text-sm text-muted hover:border-action hover:text-text">
          Continue
        </button>
      </div>
      {error ? (
        <p role="alert" className="relative mt-3 text-sm text-failed">
          {error}
        </p>
      ) : null}
      <p className="relative mt-3 text-center text-xs text-muted">Share your result on Instagram, Twitter or LinkedIn</p>
    </CelebrationDialog>
  );
}
