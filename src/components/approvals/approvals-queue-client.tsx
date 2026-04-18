"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApprovalsQueueRow } from "@/types/approvals-queue";

function stageLabel(type: string) {
  if (type === "initial_summary") return "Primeira aprovação (resumo)";
  if (type === "final_delivery") return "Aprovação final";
  return type;
}

export function ApprovalsQueueClient({ rows }: { rows: ApprovalsQueueRow[] }) {
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  const campaigns = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const c = r.task?.campaign;
      if (c?.id) m.set(c.id, c.name || "Campanha");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    if (campaignFilter === "all") return rows;
    return rows.filter((r) => r.task?.campaign?.id === campaignFilter);
  }, [rows, campaignFilter]);

  const grouped = useMemo(() => {
    const initial = filtered.filter((r) => r.approval_type === "initial_summary");
    const final = filtered.filter((r) => r.approval_type === "final_delivery");
    const other = filtered.filter(
      (r) => r.approval_type !== "initial_summary" && r.approval_type !== "final_delivery",
    );
    return { initial, final, other };
  }, [filtered]);

  function renderList(list: ApprovalsQueueRow[], emptyHint: string) {
    if (list.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">{emptyHint}</p>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-3 last:border-0"
          >
            <div>
              <p className="font-medium">{a.task?.title ?? "Tarefa"}</p>
              <p className="text-muted-foreground text-xs">
                {stageLabel(a.approval_type)}
                {a.task?.campaign?.name ? ` · ${a.task.campaign.name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">pendente</Badge>
              <Link
                className="text-primary text-sm underline"
                href={
                  a.approval_type === "initial_summary"
                    ? `/approvals/${a.task_id}/initial`
                    : `/approvals/${a.task_id}/final`
                }
              >
                Decidir
              </Link>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {campaigns.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground text-sm">Campanha:</span>
          <Select
            value={campaignFilter}
            onValueChange={(v) => setCampaignFilter(v ?? "all")}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {campaigns.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Primeira aprovação</CardTitle>
          <CardDescription>Resumo e direção antes da produção visual.</CardDescription>
        </CardHeader>
        <CardContent>
          {renderList(
            grouped.initial,
            campaignFilter === "all"
              ? "Nada nesta etapa."
              : "Nada nesta etapa para o filtro.",
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aprovação final</CardTitle>
          <CardDescription>Versão final com arte / copy para publicar.</CardDescription>
        </CardHeader>
        <CardContent>
          {renderList(
            grouped.final,
            campaignFilter === "all"
              ? "Nada nesta etapa."
              : "Nada nesta etapa para o filtro.",
          )}
        </CardContent>
      </Card>

      {grouped.other.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Outros</CardTitle>
          </CardHeader>
          <CardContent>{renderList(grouped.other, "")}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
