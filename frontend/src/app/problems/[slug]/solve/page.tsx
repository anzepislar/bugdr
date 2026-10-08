import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/solve/Workspace";
import { serverFetch } from "@/lib/serverApi";
import type { ProblemDetail } from "@/lib/types/problem";

// Outside the (app) group: the workspace has its own full-screen header instead of the app sidebar.
// The description comes from GET /problems/:slug (P2); the Workspace starts the attempt itself (R1).
export default async function SolvePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await serverFetch(`/problems/${encodeURIComponent(slug)}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`GET /problems/${slug} failed: ${res.status}`);
  const { problem } = (await res.json()) as { problem: ProblemDetail };
  // A solved problem never reopens (R1: 409 ALREADY_SOLVED).
  if (problem.status === "solved") redirect(`/problems/${slug}`);

  return (
    <Workspace
      slug={slug}
      codebaseContext={problem.codebaseContext}
      incidentReport={problem.incidentReport}
      checks={problem.checks}
      difficulty={problem.difficulty}
    />
  );
}
