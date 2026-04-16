import { notFound } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApprovalForm } from "@/components/approvals/approval-form";
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
    return renderInitialApproval({
      taskTitle: task.title,
      taskId,
      summary: proposal?.summary_markdown ?? "Sem proposta.",
      localMode: true,
    });
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

  return renderInitialApproval({
    taskTitle: task.title,
    taskId,
    summary:
      proposal?.summary_markdown ??
      "Nenhuma proposta disponível ainda. Execute o pipeline na tarefa.",
  });
}

function renderInitialApproval({
  taskTitle,
  taskId,
  summary,
  localMode = false,
}: {
  taskTitle: string;
  taskId: string;
  summary: string;
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Primeira aprovação
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{taskTitle}</p>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Resumo / direção</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-sm text-muted-foreground dark:border-gray-700 dark:bg-muted/30">
            {summary}
          </pre>
        </CardContent>
      </Card>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Decisão</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ApprovalForm taskId={taskId} phase="initial" localMode={localMode} />
        </CardContent>
      </Card>
    </div>
  );
}
