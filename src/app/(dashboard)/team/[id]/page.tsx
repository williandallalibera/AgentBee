import { notFound } from "next/navigation";
import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isLocalMode } from "@/lib/env";
import { localAgents } from "@/lib/local-mode";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isLocalMode()) {
    const agent = localAgents.find((item) => item.id === id);
    if (!agent) notFound();
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{agent.name}</h1>
          <p className="text-muted-foreground text-sm">
            {agent.role} · {agent.department}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Instruções</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-muted-foreground whitespace-pre-wrap text-sm">
              {agent.instructions_markdown}
            </pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Execuções recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0">
              <span>local_preview</span>
              <Badge variant="outline">success</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!agent) notFound();

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("agent_id", id)
    .order("started_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{agent.name}</h1>
        <p className="text-muted-foreground text-sm">
          {agent.role} · {agent.department}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instruções</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-muted-foreground whitespace-pre-wrap text-sm">
            {agent.instructions_markdown ?? "—"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execuções recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(runs ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma execução.</p>
          ) : (
            (runs ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0"
              >
                <span>{r.stage}</span>
                <Badge variant="outline">{r.status}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
