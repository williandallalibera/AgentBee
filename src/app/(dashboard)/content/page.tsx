import { requireWorkspaceMember } from "@/lib/auth/session";
import { createContentTaskFromForm } from "@/actions/content-task";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { isLocalMode } from "@/lib/env";
import { localTasks } from "@/lib/local-mode";

export default async function ContentListPage() {
  const localMode = isLocalMode();
  if (localMode) {
    return (
      <ContentPageView
        localMode
        tasks={localTasks}
      />
    );
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: tasks } = await supabase
    .from("content_tasks")
    .select("id, title, status, updated_at, current_stage")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  return <ContentPageView tasks={tasks ?? []} />;
}

function ContentPageView({
  tasks,
  localMode = false,
}: {
  tasks: {
    id: string;
    title: string;
    status: string;
    updated_at: string;
    current_stage?: string | null;
  }[];
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Conteúdo
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Backlog, resumos e versões do pipeline com duas aprovações.
        </p>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Nova tarefa</CardTitle>
          <CardDescription>
            {localMode
              ? "Modo local ativo. O formulário permanece visível para QA, mas sem persistência."
              : "Crie o briefing e depois execute o pipeline da tarefa."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form
            action={localMode ? undefined : createContentTaskFromForm}
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Título / briefing</Label>
              <Input
                id="title"
                name="title"
                placeholder="Post sobre IA aplicada à operação"
                required={!localMode}
                disabled={localMode}
              />
            </div>
            <div className="flex items-end">
              <Button type={localMode ? "button" : "submit"} disabled={localMode}>
                Criar tarefa
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Fila de conteúdo</CardTitle>
          <CardDescription>
            Itens mais recentes da operação editorial.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa.</p>
            ) : (
              tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/content/${task.id}`}
                  className="flex flex-col gap-3 rounded border border-gray-200 p-4 transition-colors hover:bg-gray-50 md:flex-row md:items-center md:justify-between dark:border-gray-700 dark:hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.current_stage ?? "—"} ·{" "}
                      {new Date(task.updated_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {task.status}
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
