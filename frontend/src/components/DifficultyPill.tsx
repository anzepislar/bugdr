import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

// Literal class names so Tailwind picks them up.
const PILL: Record<Difficulty, string> = {
  easy: "bg-easy/15 text-easy",
  medium: "bg-medium/15 text-medium",
  hard: "bg-hard/15 text-hard",
  get_a_job: "bg-get-a-job/15 text-get-a-job",
};

export function DifficultyPill({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${PILL[difficulty]}`}>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}
