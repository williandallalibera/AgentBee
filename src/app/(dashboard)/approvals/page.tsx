import Link from "next/link";
import { listPendingApprovalsForUser } from "@/actions/approvals";
import { ApprovalsQueueClient } from "@/components/approvals/approvals-queue-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isLocalMode } from "@/lib/env";
import { localApprovals } from "@/lib/local-mode";

export default async function ApprovalsPage() {
  if (isLocalMode()) {
    const rows = localApprovals;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aprovações</h1>
          <p className="text-muted-foreground text-sm">
            Fila mock para visualização local.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pendentes</CardTitle>
            <CardDescription>
              Primeira aprovação: resumo. Segunda: versão final.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-3 last:border-0"
              >
                <div>
                  <p className="font-medium">{a.task.title}</p>
                  <p className="text-muted-foreground text-xs">{a.approval_type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">pendente</Badge>
                  <Link className="text-primary text-sm underline" href={`/approvals/${a.task_id}/initial`}>
                    Decidir
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = await listPendingApprovalsForUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aprovações</h1>
        <p className="text-muted-foreground text-sm">
          Fila de decisões — também notificadas por Google Chat / e-mail. Atualiza em tempo
          real quando o Realtime está ativo.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pendentes</CardTitle>
            <CardDescription>Nada no momento.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Nada pendente no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ApprovalsQueueClient rows={rows} />
      )}
    </div>
  );
}
