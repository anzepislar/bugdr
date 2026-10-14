import type { ReactNode } from "react";

const SIZE = {
  sm: "px-3 py-2 text-sm rounded-md",
  md: "px-5 py-3 text-sm rounded-md",
  lg: "px-7 py-3.5 text-base rounded-lg",
} as const;

const VARIANT = {
  action: "glass-action font-semibold tracking-wide",
  ghost:
    "border border-[var(--glass-border)] bg-transparent text-muted transition-all duration-200 hover:border-[var(--glass-border-hover)] hover:bg-[var(--glass-bg)] hover:text-text",
  danger:
    "border border-[var(--glass-danger-border)] bg-[var(--glass-danger-bg)] text-failed hover:border-red-500/40 hover:bg-red-500/15",
} as const;

export default function GlassButton({
  children,
  variant = "action",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled = false,
  onClick,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`focus-ring inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-60 ${
        VARIANT[variant]
      } ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {loading && (
        <span className="animate-spin-smooth mr-2 inline-block h-3.5 w-3.5 rounded-full border-2 border-action/25 border-t-action" />
      )}
      {children}
    </button>
  );
}
