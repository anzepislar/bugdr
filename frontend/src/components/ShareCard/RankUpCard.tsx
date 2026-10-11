import { RankBadge, getRankColor, type Rank } from "@/components/RankBadge";
import { C, CardFrame, Divider, PAD, SIZE, StatsRow } from "./shared";

export interface RankUpCardProps {
  newRank: Rank;
  previousRank: Rank;
  problemsSolved: number;
  totalPoints: number;
  currentStreak: number;
  username: string;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
}

const BADGE = 240;

export function RankUpCard({
  newRank,
  previousRank,
  problemsSolved,
  totalPoints,
  currentStreak,
  username,
  className,
  svgRef,
}: RankUpCardProps) {
  const color = getRankColor(newRank);
  // Same drawing spaces as RankBadge: Distinguished is 1.3× wider and has its own aspect ratio.
  const distinguished = newRank === "Distinguished";
  const badgeWidth = distinguished ? BADGE * 1.3 : BADGE;
  const badgeHeight = distinguished ? (badgeWidth * 138) / 166 : (badgeWidth * 80) / 88;
  const center = SIZE / 2;

  return (
    <CardFrame id="rank-up-card" label={`Ranked up to ${newRank}`} stroke={color} strokeWidth={1.5} className={className} svgRef={svgRef}>
      <text x={center} y="196" fontSize="24" letterSpacing="8" fill={C.muted} textAnchor="middle">
        RANKED UP
      </text>
      <RankBadge bare rank={newRank} size={BADGE} x={center - badgeWidth / 2} y={232 + (260 - badgeHeight) / 2} />
      <text x={center} y="592" fontSize="84" fontWeight="700" fill={color} textAnchor="middle">
        {newRank}
      </text>
      <text x={center} y="650" fontSize="28" fill={C.muted} textAnchor="middle">
        {previousRank} → {newRank}
      </text>

      <Divider y={710} />
      <StatsRow
        y={772}
        stats={[
          ["PROBLEMS", String(problemsSolved)],
          ["POINTS", totalPoints.toLocaleString("en-US")],
          ["STREAK", `${currentStreak}d`],
        ]}
      />
      <Divider y={900} />

      <text x={PAD} y="984" fontSize="28" fill={C.muted}>
        @{username}
      </text>
      <text x={SIZE - PAD} y="984" fontSize="28" fill={C.muted} textAnchor="end">
        bugdr.app
      </text>
    </CardFrame>
  );
}
