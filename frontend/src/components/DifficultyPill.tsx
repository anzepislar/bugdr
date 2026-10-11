import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/types/problem";

// Literal class names so Tailwind picks them up.
const PILL: Record<Difficulty, string> = {
  easy: "border-easy/25 bg-easy/10 text-easy",
  medium: "border-medium/25 bg-medium/10 text-medium",
  hard: "border-hard/25 bg-hard/10 text-hard",
  get_a_job: "border-get-a-job/25 bg-get-a-job/10 text-get-a-job",
};

export function DifficultyPill({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`inline-block rounded-[8px] border px-2 py-1 backdrop-blur-sm text-xs font-semibold ${PILL[difficulty]}`}>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}
