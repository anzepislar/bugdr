import type { ReactNode } from "react";

// Level badges (03_scoring.md levels). Drawn in the coordinates of the reference design
// (bugdr_rank_badges_v2.svg) and scaled by the viewBox, so everything follows the size prop.

export type Rank = "Intern" | "Junior" | "Mid" | "Senior" | "Staff" | "Principal" | "Distinguished";

const RANKS: { rank: Rank; minPoints: number }[] = [
  { rank: "Intern", minPoints: 0 },
  { rank: "Junior", minPoints: 500 },
  { rank: "Mid", minPoints: 1500 },
  { rank: "Senior", minPoints: 3500 },
  { rank: "Staff", minPoints: 7500 },
  { rank: "Principal", minPoints: 15000 },
  { rank: "Distinguished", minPoints: 30000 },
];

/** Flat-top hexagon around (cx, cy): half width, half height, half the length of the top edge. */
function hexagon(cx: number, cy: number, halfWidth: number, halfHeight: number, halfTop: number): string {
  return [
    [cx - halfTop, cy - halfHeight],
    [cx + halfTop, cy - halfHeight],
    [cx + halfWidth, cy],
    [cx + halfTop, cy + halfHeight],
    [cx - halfTop, cy + halfHeight],
    [cx - halfWidth, cy],
  ]
    .map((p) => p.join(","))
    .join(" ");
}

const mono = { fontFamily: "monospace", fontWeight: 700 } as const;

interface Style {
  accent: string;
  gradient: string[];
  stroke: string;
  strokeWidth: number;
  inner: string;
  icon: ReactNode;
}

const STYLES: Record<Exclude<Rank, "Distinguished">, Style> = {
  Intern: {
    accent: "#9ca3af",
    gradient: ["#374151", "#111827"],
    stroke: "#6b7280",
    strokeWidth: 2,
    inner: "#374151",
    icon: (
      <>
        <text x="70" y="36" textAnchor="middle" fontSize="14" fill="#9ca3af" {...mono}>
          &gt;_
        </text>
        <text x="70" y="54" textAnchor="middle" fontSize="10" fill="#6b7280" fontFamily="monospace">
          01
        </text>
      </>
    ),
  },
  Junior: {
    accent: "#60a5fa",
    gradient: ["#1d4ed8", "#0f172a"],
    stroke: "#60a5fa",
    strokeWidth: 2,
    inner: "#1e40af",
    icon: (
      <>
        <text x="57" y="50" textAnchor="middle" fontSize="20" fill="#93c5fd" {...mono}>
          {"{"}
        </text>
        <text x="83" y="50" textAnchor="middle" fontSize="20" fill="#93c5fd" {...mono}>
          {"}"}
        </text>
      </>
    ),
  },
  Mid: {
    accent: "#2dd4bf",
    gradient: ["#0d9488", "#042f2e"],
    stroke: "#2dd4bf",
    strokeWidth: 2,
    inner: "#0f766e",
    icon: (
      <>
        <line x1="46" y1="58" x2="94" y2="22" stroke="#5eead4" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="46" cy="58" r="3" fill="#2dd4bf" />
        <circle cx="94" cy="22" r="3" fill="#2dd4bf" />
      </>
    ),
  },
  Senior: {
    accent: "#fbbf24",
    gradient: ["#d97706", "#1c1200"],
    stroke: "#fbbf24",
    strokeWidth: 2.5,
    inner: "#92400e",
    icon: <polygon points="70,18 78,36 98,36 82,48 88,66 70,54 52,66 58,48 42,36 62,36" fill="#fbbf24" opacity="0.85" />,
  },
  Staff: {
    accent: "#fb923c",
    gradient: ["#ea580c", "#1a0a00"],
    stroke: "#fb923c",
    strokeWidth: 2.5,
    inner: "#9a3412",
    icon: (
      <g stroke="#fb923c">
        <circle cx="70" cy="40" r="10" fill="none" strokeWidth="2" />
        <line x1="40" y1="40" x2="60" y2="40" strokeWidth="2" />
        <line x1="80" y1="40" x2="100" y2="40" strokeWidth="2" />
        <line x1="70" y1="20" x2="70" y2="30" strokeWidth="2" />
        <line x1="70" y1="50" x2="70" y2="60" strokeWidth="2" />
        <line x1="56" y1="26" x2="63" y2="33" strokeWidth="1.5" />
        <line x1="77" y1="47" x2="84" y2="54" strokeWidth="1.5" />
        <circle cx="70" cy="40" r="4" fill="#fb923c" stroke="none" />
      </g>
    ),
  },
  Principal: {
    accent: "#c084fc",
    gradient: ["#7c3aed", "#120a1f"],
    stroke: "#c084fc",
    strokeWidth: 2.5,
    inner: "#4c1d95",
    icon: (
      <text x="70" y="54" textAnchor="middle" fontSize="28" fill="#e879f9" {...mono}>
        λ
      </text>
    ),
  },
};

const DISTINGUISHED_GRADIENT = ["#fbbf24", "#f8fafc", "#94a3b8"];
const DISTINGUISHED_SCALE = 1.3;

/** Primary accent color of a rank (labels, highlights). Unknown ranks get Intern's. */
export function getRankColor(rank: string): string {
  return rank === "Distinguished" ? "#fbbf24" : (STYLES[rank as keyof typeof STYLES] ?? STYLES.Intern).accent;
}

/** The rank for a point total (level thresholds from 03_scoring.md). */
export function getRankFromPoints(points: number): Rank {
  return RANKS.filter((r) => points >= r.minPoints).at(-1)?.rank ?? "Intern";
}

/** The rank after this one; null for Distinguished (or an unknown rank). */
export function getNextRank(rank: string): Rank | null {
  const i = RANKS.findIndex((r) => r.rank === rank);
  return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1].rank : null;
}

interface RankBadgeProps {
  rank: Rank;
  /** Width in px (default 48). Distinguished renders at size × 1.3. */
  size?: number;
  /** Rank name below the badge in the accent color. */
  showLabel?: boolean;
  className?: string;
}

function Gradient({ id, colors }: { id: string; colors: string[] }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      {colors.map((c, i) => (
        <stop key={c} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={c} />
      ))}
    </linearGradient>
  );
}

export function RankBadge({ rank, size = 48, showLabel = false, className = "" }: RankBadgeProps) {
  const id = `${rank.toLowerCase()}-grad`;
  const distinguished = rank === "Distinguished";
  const width = distinguished ? size * DISTINGUISHED_SCALE : size;
  // Reference drawing spaces, with room for the outer stroke.
  const viewBox = distinguished ? { x: 77, y: 1, w: 166, h: 138 } : { x: 26, y: 0, w: 88, h: 80 };
  const height = (width * viewBox.h) / viewBox.w;
  const a11y = showLabel ? { "aria-hidden": true } : { role: "img", "aria-label": `${rank} rank` };

  const svg = distinguished ? (
    <svg width={width} height={height} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} {...a11y}>
      <defs>
        <Gradient id={id} colors={DISTINGUISHED_GRADIENT} />
      </defs>
      <polygon points={hexagon(160, 70, 80, 66, 40)} fill="#0a0a0a" stroke={`url(#${id})`} strokeWidth="3" />
      <polygon points={hexagon(160, 70, 72, 54, 40)} fill="none" stroke="#78716c" strokeWidth="1" />
      <polygon
        points="160,30 168,52 190,44 178,64 200,70 178,76 190,96 168,88 160,110 152,88 130,96 142,76 120,70 142,64 130,44 152,52"
        fill={`url(#${id})`}
        opacity="0.95"
      />
    </svg>
  ) : (
    <svg width={width} height={height} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} {...a11y}>
      <defs>
        <Gradient id={id} colors={STYLES[rank].gradient} />
      </defs>
      <polygon points={hexagon(70, 40, 42, 38, 20)} fill={`url(#${id})`} stroke={STYLES[rank].stroke} strokeWidth={STYLES[rank].strokeWidth} />
      <polygon points={hexagon(70, 40, 38, 30, 20)} fill="none" stroke={STYLES[rank].inner} strokeWidth="1" />
      {STYLES[rank].icon}
    </svg>
  );

  if (!showLabel) return <span className={`inline-flex shrink-0 ${className}`}>{svg}</span>;
  return (
    <span className={`inline-flex shrink-0 flex-col items-center gap-1 ${className}`}>
      {svg}
      <span className="font-medium leading-tight" style={{ color: getRankColor(rank), fontSize: Math.max(10, width * 0.2) }}>
        {rank}
      </span>
    </span>
  );
}
