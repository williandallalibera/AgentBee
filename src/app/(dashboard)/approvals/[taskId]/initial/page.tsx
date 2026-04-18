import { notFound } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { ApprovalRichWorkspace } from "@/components/approvals/approval-rich-workspace";
import { isLocalMode } from "@/lib/env";
import { localProposals, localTasks } from "@/lib/local-mode";

export default async function InitialApprovalPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  if (isLocalMode()) {
    const task = localTasks.find((item) => item.id === taskId);
    if (!task) notFound();
    const proposal = localProposals[taskId as keyof typeof localProposals];
    return (
      <ApprovalRichWorkspace
        taskId={taskId}
        phase="initial"
        taskTitle={task.title}
        copyMarkdown={proposal?.summary_markdown ?? "Sem proposta."}
        imageUrl={null}
        agentRuns={[]}
        previousCopy={null}
        commentHistory={[]}
        localMode
      />
    );
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: task } = await supabase
    .from("content_tasks")
    .select("id, title")
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!task) notFound();

  const { data: proposal } = await supabase
    .from("content_proposals")
    .select("summary_markdown, status")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("stage, status, output_summary, finished_at")
    .eq("task_id", taskId)
    .order("finished_at", { ascending: false })
    .limit(24);

  const { data: hist } = await supabase
    .from("approvals")
    .select("id, comments, status, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <ApprovalRichWorkspace
      taskId={taskId}
      phase="initial"
      taskTitle={task.title}
      copyMarkdown={
        proposal?.summary_markdown ??
        "Nenhuma proposta disponível ainda. Execute o pipeline na tarefa."
      }
      imageUrl={null}
      agentRuns={(runs ?? []) as never}
      previousCopy={null}
      commentHistory={(hist ?? []) as never}
    />
  );
}
