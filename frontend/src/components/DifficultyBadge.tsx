import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

// Difficulty badges as terminal windows (bugdr_difficulty_badges_v2.svg). Drawn in the reference's
// 130×130 coordinates and scaled by the viewBox; sm is a plain tag without the terminal chrome.

interface Style {
  color: string;
  strokeWidth: number;
  bar: string;
  divider: string;
  tint: string;
  status: string;
  exitCode: number;
  message: string;
}

const STYLES: Record<Difficulty, Style> = {
  easy: { color: "#22c55e", strokeWidth: 1.5, bar: "#1a2e1a", divider: "#1e3a1e", tint: "#0a1f0a", status: "✓ INFO", exitCode: 0, message: "success" },
  medium: { color: "#f59e0b", strokeWidth: 1.5, bar: "#2a1f00", divider: "#3a2a00", tint: "#1f1700", status: "⚠ WARN", exitCode: 1, message: "caution" },
  hard: { color: "#f97316", strokeWidth: 1.5, bar: "#2a1200", divider: "#3a1800", tint: "#1f0e00", status: "✗ ERROR", exitCode: 2, message: "prod is down" },
  get_a_job: { color: "#ef4444", strokeWidth: 2, bar: "#2a0000", divider: "#3a0000", tint: "#1f0505", status: "✗ FATAL", exitCode: 137, message: "call us if fixed" },
};

const SIZES = { sm: 64, md: 130, lg: 180 } as const;

const styleOf = (difficulty: string) => STYLES[difficulty as Difficulty] ?? STYLES.easy;

/** Badge color of a difficulty. Unknown difficulties get Easy's. */
export function getDifficultyColor(difficulty: string): string {
  return styleOf(difficulty).color;
}

/** Very dark tint of the color (background of the share card pill). */
export function getDifficultyTint(difficulty: string): string {
  return styleOf(difficulty).tint;
}

/** Display name: "Easy", "Medium", "Hard", "Get a job". */
export function getDifficultyLabel(difficulty: string): string {
  return DIFFICULTY_LABEL[difficulty as Difficulty] ?? difficulty;
}

/** The badge's joke exit code: 0, 1, 2, 137. */
export function getDifficultyExitCode(difficulty: string): number {
  return styleOf(difficulty).exitCode;
}

interface DifficultyBadgeProps {
  difficulty: Difficulty;
  /** sm = inline tag (~22px tall), md = 130px terminal, lg = 180px terminal. Default md. */
  size?: keyof typeof SIZES;
  /** Difficulty name below the badge in its color. */
  showLabel?: boolean;
  className?: string;
}

const mono = { fontFamily: "monospace" } as const;

export function DifficultyBadge({ difficulty, size = "md", showLabel = false, className = "" }: DifficultyBadgeProps) {
  const s = STYLES[difficulty];
  const tag = `[${DIFFICULTY_LABEL[difficulty].toUpperCase()}]`;
  const label = DIFFICULTY_LABEL[difficulty];
  const fatal = difficulty === "get_a_job";

  if (size === "sm")
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-[8px] border px-2.5 backdrop-blur-sm py-1 font-mono text-[11px] leading-[14px] ${className}`}
        // Hex alpha: 40 = 0.25, 1a = 0.10.
        style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}1a` }}
      >
        {tag}
      </span>
    );

  const width = SIZES[size];
  const a11y = showLabel ? { "aria-hidden": true } : { role: "img", "aria-label": `${label} difficulty` };
  // Inset by half the stroke so the outline isn't clipped at the viewBox edge.
  const inset = s.strokeWidth / 2;
  const svg = (
    <svg width={width} height={width} viewBox="0 0 130 130" {...a11y}>
      <defs>
        <clipPath id={`difficulty-${difficulty}-clip`}>
          <rect x={inset} y={inset} width={130 - 2 * inset} height={130 - 2 * inset} rx="8" />
        </clipPath>
      </defs>
      <g clipPath={`url(#difficulty-${difficulty}-clip)`}>
        <rect width="130" height="130" fill="#151618" />
        <rect width="130" height="22" fill={s.bar} />
      </g>
      <rect x={inset} y={inset} width={130 - 2 * inset} height={130 - 2 * inset} rx="8" fill="none" stroke={s.color} strokeWidth={s.strokeWidth} />
      {[12, 22, 32].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy="11"
          r="3"
          fill={fatal || i === 2 ? s.color : "#374151"}
          opacity={fatal ? 0.9 : i === 2 ? 0.7 : 1}
        />
      ))}
      <text x="10" y="44" fontSize="9" fill="#4b5563" {...mono}>
        $ bugdr run
      </text>
      <text x="10" y="60" fontSize="8" fill={s.color} {...mono}>
        {s.status}
      </text>
      <text x="10" y={fatal ? 75 : 78} fontSize={fatal ? 9 : 11} fontWeight="700" fill={s.color} {...mono}>
        {tag}
      </text>
      <text x="10" y={fatal ? 93 : 96} fontSize="8" fill="#4b5563" {...mono}>
        exit code {s.exitCode}
      </text>
      <rect x="10" y="108" width="110" height="1" fill={s.divider} />
      <text x="10" y="122" fontSize="8" fill="#374151" {...mono}>
        {s.message}
      </text>
    </svg>
  );

  if (!showLabel) return <span className={`inline-flex shrink-0 ${className}`}>{svg}</span>;
  return (
    <span className={`inline-flex shrink-0 flex-col items-center gap-2 ${className}`}>
      {svg}
      <span className="font-medium leading-tight" style={{ color: s.color, fontSize: width * 0.11 }}>
        {label}
      </span>
    </span>
  );
}
