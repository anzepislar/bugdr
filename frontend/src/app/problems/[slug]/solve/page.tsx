import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/solve/Workspace";
import { mockGetProblem } from "@/lib/mock/problems";

// Outside the (app) group: the workspace has its own full-screen header instead of the app sidebar.
export default async function SolvePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const problem = await mockGetProblem(slug);
  if (!problem) notFound();
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
