import { ProblemBrowser } from "@/components/problems/ProblemBrowser";

// The top bar search submits here as ?q=. Keyed so a new header search resets the filters.
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold text-text">Explore problems</h1>
      <p className="mt-2 text-muted">Real codebases. Real incidents. Find your next challenge.</p>
      <ProblemBrowser key={q} initialQuery={q} />
    </div>
  );
}
