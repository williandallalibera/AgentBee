import { notFound } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { ApprovalRichWorkspace } from "@/components/approvals/approval-rich-workspace";
import { isLocalMode } from "@/lib/env";
import { localTasks, localVersions } from "@/lib/local-mode";

export default async function FinalApprovalPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  if (isLocalMode()) {
    const task = localTasks.find((item) => item.id === taskId);
    if (!task) notFound();
    const version = localVersions[taskId as keyof typeof localVersions];
    return (
      <ApprovalRichWorkspace
        taskId={taskId}
        phase="final"
        taskTitle={task.title}
        copyMarkdown={version?.copy_markdown ?? "Sem versão final."}
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

  const { data: versions } = await supabase
    .from("content_versions")
    .select("copy_markdown, visual_draft_url, version_number")
    .eq("task_id", taskId)
    .order("version_number", { ascending: false })
    .limit(2);

  const latest = versions?.[0];
  const previous = versions?.[1];

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

  const imageUrl =
    typeof latest?.visual_draft_url === "string" && latest.visual_draft_url.startsWith("http")
      ? latest.visual_draft_url
      : null;

  return (
    <ApprovalRichWorkspace
      taskId={taskId}
      phase="final"
      taskTitle={task.title}
      copyMarkdown={latest?.copy_markdown ?? "Nenhuma versão final ainda."}
      imageUrl={imageUrl}
      agentRuns={(runs ?? []) as never}
      previousCopy={previous?.copy_markdown ?? null}
      commentHistory={(hist ?? []) as never}
    />
  );
}
