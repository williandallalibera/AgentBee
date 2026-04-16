import { notFound } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PipelineButton } from "@/components/content/pipeline-button";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isLocalMode } from "@/lib/env";
import { localProposals, localTasks, localVersions } from "@/lib/local-mode";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isLocalMode()) {
    const task = localTasks.find((item) => item.id === id);
    if (!task) notFound();
    const proposal = localProposals[id as keyof typeof localProposals];
    const version = localVersions[id as keyof typeof localVersions];
    return renderContentDetail({
      id,
      title: task.title,
      status: task.status,
      currentStage: task.current_stage ?? "—",
      proposal: proposal?.summary_markdown ?? "Nenhuma proposta.",
      version: version?.copy_markdown ?? "Nenhuma versão.",
      localMode: true,
    });
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: task } = await supabase
    .from("content_tasks")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!task) notFound();

  const { data: proposals } = await supabase
    .from("content_proposals")
    .select("*")
    .eq("task_id", id)
    .order("created_at", { ascending: false });

  const { data: versions } = await supabase
    .from("content_versions")
    .select("*")
    .eq("task_id", id)
    .order("version_number", { ascending: false });

  const initial = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/approvals/${id}/initial`;
  const final = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/approvals/${id}/final`;

  return renderContentDetail({
    id,
    title: task.title,
    status: task.status,
    currentStage: task.current_stage ?? "—",
    proposal:
      (proposals ?? []).length === 0
        ? "Nenhuma proposta — execute o pipeline."
        : (proposals ?? [])[0]?.summary_markdown,
    version:
      (versions ?? []).length === 0
        ? "Nenhuma versão."
        : (versions ?? [])[0]?.copy_markdown,
    initialLink: initial,
    finalLink: final,
  });
}

function renderContentDetail({
  id,
  title,
  status,
  currentStage,
  proposal,
  version,
  initialLink,
  finalLink,
  localMode = false,
}: {
  id: string;
  title: string;
  status: string;
  currentStage: string;
  proposal: string;
  version: string;
  initialLink?: string;
  finalLink?: string;
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-gray-800 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{currentStage}</p>
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <PipelineButton taskId={id} localMode={localMode} />
          <div className="flex flex-wrap gap-2">
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              href={`/approvals/${id}/initial`}
            >
              Aprovação inicial
            </Link>
            <Link
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              href={`/approvals/${id}/final`}
            >
              Aprovação final
            </Link>
          </div>
          {initialLink && finalLink ? (
            <div className="rounded border border-dashed border-gray-200 p-3 text-xs text-muted-foreground dark:border-gray-700">
              <p className="break-all">Inicial: {initialLink}</p>
              <p className="mt-1 break-all">Final: {finalLink}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle>Propostas</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-xs text-muted-foreground dark:border-gray-700 dark:bg-muted/30">
              {proposal}
            </pre>
          </CardContent>
        </Card>

        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle>Versões / copy</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-xs text-muted-foreground dark:border-gray-700 dark:bg-muted/30">
              {version}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
