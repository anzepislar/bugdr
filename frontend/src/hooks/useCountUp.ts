import { useEffect, useState } from "react";

/** Counts from 0 to target over duration ms (ease-out), starting after delay ms. Reduced motion: target at once. */
export function useCountUp(target: number, duration = 800, delay = 0): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 0 : duration;
    let frame = 0;
    const timer = setTimeout(
      () => {
        const start = performance.now();
        const tick = (now: number) => {
          const t = ms ? Math.min(1, (now - start) / ms) : 1;
          setValue(Math.round(target * (1 - (1 - t) ** 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      reduced ? 0 : delay,
    );
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, duration, delay]);
  return value;
}
