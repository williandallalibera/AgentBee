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
    return renderFinalApproval({
      taskTitle: task.title,
      taskId,
      copy: version?.copy_markdown ?? "Sem versão final.",
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

  const { data: version } = await supabase
    .from("content_versions")
    .select("copy_markdown, carousel_structure_json")
    .eq("task_id", taskId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return renderFinalApproval({
    taskTitle: task.title,
    taskId,
    copy: version?.copy_markdown ?? "Nenhuma versão final ainda.",
  });
}

function renderFinalApproval({
  taskTitle,
  taskId,
  copy,
  localMode = false,
}: {
  taskTitle: string;
  taskId: string;
  copy: string;
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Aprovação final
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{taskTitle}</p>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Copy e estrutura</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-sm text-muted-foreground dark:border-gray-700 dark:bg-muted/30">
            {copy}
          </pre>
        </CardContent>
      </Card>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Decisão</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ApprovalForm taskId={taskId} phase="final" localMode={localMode} />
        </CardContent>
      </Card>
    </div>
  );
}
