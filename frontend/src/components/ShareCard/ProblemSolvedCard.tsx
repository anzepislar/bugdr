import { getDifficultyColor, getDifficultyTint } from "@/components/DifficultyBadge";
import { RankBadge, getRankFromPoints } from "@/components/RankBadge";
import type { Difficulty } from "@/lib/types/problem";
import { C, CardFrame, Divider, Label, PAD, SIZE, StatsRow, textWidth } from "./shared";

export interface ProblemSolvedCardProps {
  problemTitle: string;
  difficulty: Difficulty;
  prompts: number;
  tokens: number;
  /** e.g. "18m" */
  timeTaken: string;
  /** 0.5-2.0, e.g. 1.8 */
  efficiencyScore: number;
  /** "top 12%" pill; hidden when unknown (no percentile from the API yet). */
  percentile?: number | null;
  username: string;
  rank: string;
  points: number;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
}

const TITLE_SIZE = 60;
const TITLE_CHARS = Math.floor((SIZE - 2 * PAD) / (TITLE_SIZE * 0.6));

/** Word-wraps into at most two lines; the second ends in "…" when the title is longer. */
function titleLines(title: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of title.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= TITLE_CHARS) line = next;
    else {
      lines.push(line || word.slice(0, TITLE_CHARS));
      line = line ? word : "";
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  const second = lines.slice(1).join(" ");
  return [lines[0], `${second.slice(0, TITLE_CHARS - 1).trimEnd()}…`];
}

export function ProblemSolvedCard({
  problemTitle,
  difficulty,
  prompts,
  tokens,
  timeTaken,
  efficiencyScore,
  percentile,
  username,
  rank,
  points,
  className,
  svgRef,
}: ProblemSolvedCardProps) {
  const color = getDifficultyColor(difficulty);
  const tag = `[${difficulty.replaceAll("_", " ").toUpperCase()}]`;
  const tagWidth = textWidth(tag, 24) + 40;
  const score = `${efficiencyScore.toFixed(1)}x`;
  const top = `top ${percentile}%`;
  const rankText = `${rank} · ${points.toLocaleString("en-US")} pts`;
  const rankTextX = SIZE - PAD;
  const badgeRank = getRankFromPoints(points);
  const badgeWidth = badgeRank === "Distinguished" ? 78 : 60; // RankBadge draws Distinguished 1.3× wider
  const badgeX = rankTextX - textWidth(rankText, 28) - 18 - badgeWidth;
  const lines = titleLines(problemTitle);

  return (
    <CardFrame id="solved-card" label={`Solved ${problemTitle}`} className={className} svgRef={svgRef}>
      <rect x={PAD} y="152" width={tagWidth} height="48" rx="6" fill={getDifficultyTint(difficulty)} stroke={color} strokeWidth="1.5" />
      <text x={PAD + 20} y="184" fontSize="24" fill={color}>
        {tag}
      </text>

      {lines.map((line, i) => (
        <text key={i} x={PAD} y={290 + i * 76} fontSize={TITLE_SIZE} fontWeight="700" fill={C.text}>
          {line}
        </text>
      ))}

      <Divider y={430} />
      <StatsRow
        y={492}
        stats={[
          ["PROMPTS", String(prompts)],
          ["TOKENS", tokens.toLocaleString("en-US")],
          ["TIME", timeTaken],
        ]}
      />
      <Divider y={620} />

      <Label x={PAD} y={682}>
        EFFICIENCY SCORE
      </Label>
      <text x={PAD} y="808" fontSize="120" fontWeight="700" fill={C.action}>
        {score}
      </text>
      {percentile != null ? (
        <g>
          <rect x={PAD + textWidth(score, 120) + 32} y="740" width={textWidth(top, 28) + 40} height="52" rx="26" fill="#0a1f0a" stroke={C.passed} strokeWidth="1.5" />
          <text x={PAD + textWidth(score, 120) + 52} y="775" fontSize="28" fill={C.passed}>
            {top}
          </text>
        </g>
      ) : null}

      <Divider y={870} />
      <text x={PAD} y="974" fontSize="28" fill={C.muted}>
        @{username}
      </text>
      <RankBadge bare rank={badgeRank} size={60} x={badgeX} y={badgeRank === "Distinguished" ? 932 : 938} />
      <text x={rankTextX} y="974" fontSize="28" fill={C.muted} textAnchor="end">
        {rankText}
      </text>
    </CardFrame>
  );
}
