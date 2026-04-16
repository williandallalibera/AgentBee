import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isLocalMode } from "@/lib/env";
import { localLogs } from "@/lib/local-mode";

export default async function LogsPage() {
  if (isLocalMode()) {
    return <LogsPageView logs={localLogs} localMode />;
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  return <LogsPageView logs={logs ?? []} />;
}

function LogsPageView({
  logs,
  localMode = false,
}: {
  logs: {
    id: string;
    created_at: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
  }[];
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Logs e auditoria
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Eventos do workspace e rastreabilidade operacional.
          {localMode ? " Exibindo eventos mock." : ""}
        </p>
      </div>
      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Últimos eventos</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ScrollArea className="h-[480px] pr-4">
            <div className="space-y-3 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">Nenhum evento.</p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="break-all text-muted-foreground">
                      {new Date(log.created_at).toISOString()}
                    </div>
                    <div className="mt-1 text-foreground">{log.action}</div>
                    <div className="mt-1 break-all text-muted-foreground">
                      {log.entity_type} {log.entity_id}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
