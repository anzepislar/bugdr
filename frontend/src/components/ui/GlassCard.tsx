import type { ReactNode } from "react";

const PADDING = { none: "p-0", sm: "p-4", md: "p-6", lg: "p-8" } as const;

export default function GlassCard({
  children,
  className = "",
  accent = false,
  heavy = false,
  hover = false,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  heavy?: boolean;
  hover?: boolean;
  padding?: keyof typeof PADDING;
}) {
  return (
    <div
      className={`${heavy ? "glass-heavy" : "glass"} overflow-hidden rounded-xl ${
        hover ? "cursor-pointer transition-all duration-200" : ""
      } ${className}`}
    >
      {accent && <div className="accent-stripe" />}
      <div className={PADDING[padding]}>{children}</div>
    </div>
  );
}
