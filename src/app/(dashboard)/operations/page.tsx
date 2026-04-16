import { requireWorkspaceMember } from "@/lib/auth/session";
import { STAGE_LABELS } from "@/lib/workflows/content-task";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isLocalMode } from "@/lib/env";
import { localTasks } from "@/lib/local-mode";

const pipeline = [
  "research",
  "plan",
  "initial_approval",
  "copy_art",
  "audit",
  "final_approval",
  "publish",
];

export default async function OperationsPage() {
  if (isLocalMode()) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operações</h1>
          <p className="text-muted-foreground text-sm">
            Pipeline local com dados mock.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Referência de etapas</CardTitle>
            <CardDescription>
              Briefing → Pesquisa → Resumo → … → Publicação
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {pipeline.map((s) => (
              <Badge key={s} variant="outline">
                {STAGE_LABELS[s] ?? s}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tarefas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {localTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0"
              >
                <span className="font-medium">{t.title}</span>
                <span className="text-muted-foreground">
                  {t.current_stage ?? "—"} · {t.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: tasks } = await supabase
    .from("content_tasks")
    .select("id, title, status, current_stage")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("id, stage, status, started_at, task_id")
    .order("started_at", { ascending: false })
    .limit(30);

  const taskTitleMap = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operações</h1>
        <p className="text-muted-foreground text-sm">
          Pipeline ao vivo e execuções de agentes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Referência de etapas</CardTitle>
          <CardDescription>
            Briefing → Pesquisa → Resumo → … → Publicação
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {pipeline.map((s) => (
            <Badge key={s} variant="outline">
              {STAGE_LABELS[s] ?? s}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tarefas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tasks ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0"
            >
              <span className="font-medium">{t.title}</span>
              <span className="text-muted-foreground">
                {t.current_stage ?? "—"} · {t.status}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execuções recentes (agent_runs)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(runs ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem execuções.</p>
          ) : (
            (runs ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0"
              >
                <span>
                  {r.task_id ? taskTitleMap.get(r.task_id) ?? r.task_id : "—"}{" "}
                  · {r.stage}
                </span>
                <Badge variant="outline">{r.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
