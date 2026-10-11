"use client";

import { useCountUp } from "@/hooks/useCountUp";
import { duration } from "@/lib/format";

/** A stat number counting up on mount (solved result). time = seconds shown as MM:SS. */
export function CountUp({ to, delay = 0, format }: { to: number; delay?: number; format?: "time" | "number" }) {
  const value = useCountUp(to, 800, delay);
  return <>{format === "time" ? duration(value) : format === "number" ? value.toLocaleString("en-US") : value}</>;
}
