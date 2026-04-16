import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isLocalMode } from "@/lib/env";
import { localLogs, localTasks } from "@/lib/local-mode";

export default async function ObservabilityPage() {
  if (isLocalMode()) {
    const byStatus = localTasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return renderObservability({
      byStatus,
      totalCost: 0,
      errorRuns: 0,
      localEvents: localLogs.length,
      localMode: true,
    });
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: tasks } = await supabase
    .from("content_tasks")
    .select("id, status")
    .eq("workspace_id", workspaceId);

  const taskIds = (tasks ?? []).map((t) => t.id);

  const { data: runs } =
    taskIds.length > 0
      ? await supabase
          .from("agent_runs")
          .select("cost_estimate, status")
          .in("task_id", taskIds)
      : { data: [] };

  const byStatus = (tasks ?? []).reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const totalCost =
    (runs ?? []).reduce((s, r) => s + (Number(r.cost_estimate) || 0), 0) || 0;

  const errorRuns = (runs ?? []).filter((r) => r.status === "error").length;

  return renderObservability({
    byStatus,
    totalCost,
    errorRuns,
    localEvents: 0,
  });
}

function renderObservability({
  byStatus,
  totalCost,
  errorRuns,
  localEvents,
  localMode = false,
}: {
  byStatus: Record<string, number>;
  totalCost: number;
  errorRuns: number;
  localEvents: number;
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Observabilidade
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Métricas mínimas da operação editorial e dos agentes.
          {localMode ? " Visualização local com dados simulados." : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardDescription>Tarefas por status</CardDescription>
            <CardTitle className="text-lg">
              {Object.keys(byStatus).length} estados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-4 text-xs text-muted-foreground">
            {Object.entries(byStatus).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <span className="truncate">{key}</span>
                <span>{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardDescription>Custo estimado (agent_runs)</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {totalCost.toFixed(4)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 text-xs text-muted-foreground">
            {localMode
              ? `Eventos locais disponíveis: ${localEvents}.`
              : "Preencha cost_estimate nos runs para valores reais."}
          </CardContent>
        </Card>

        <Card className="rounded bg-white shadow dark:bg-card">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardDescription>Falhas em execuções</CardDescription>
            <CardTitle className="text-lg tabular-nums">{errorRuns}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
