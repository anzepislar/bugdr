import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/solve/Workspace";
import { serverFetch } from "@/lib/serverApi";
import type { ProblemDetail } from "@/lib/types/problem";

// Outside the (app) group: the workspace has its own full-screen header instead of the app sidebar.
// The description comes from GET /problems/:slug (P2); the Workspace starts the attempt itself (R1).
export default async function SolvePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  const [{ slug }, { path }] = await Promise.all([params, searchParams]);
  const res = await serverFetch(`/problems/${encodeURIComponent(slug)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`GET /problems/${slug} failed: ${res.status}`);
  const { problem } = (await res.json()) as { problem: ProblemDetail };
  // A solved problem never reopens (R1: 409 ALREADY_SOLVED). A career path problem can come back (K2, D66 f),
  // so on a path the start decides.
  if (problem.status === "solved" && !path) redirect(`/problems/${slug}`);

  return (
    <Workspace
      slug={slug}
      codebaseContext={problem.codebaseContext}
      incidentReport={problem.incidentReport}
      checks={problem.checks}
      difficulty={problem.difficulty}
      careerPath={path ?? null}
    />
  );
}
