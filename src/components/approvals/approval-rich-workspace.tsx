"use client";

import { useEffect, useCallback } from "react";
import { ApprovalForm } from "@/components/approvals/approval-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AgentRunRow = {
  stage: string;
  status: string;
  output_summary: string | null;
  finished_at: string | null;
};

export type CommentRow = {
  id: string;
  comments: string | null;
  status: string;
  created_at: string;
};

export function ApprovalRichWorkspace({
  taskId,
  phase,
  taskTitle,
  copyMarkdown,
  imageUrl,
  agentRuns,
  previousCopy,
  commentHistory,
  localMode = false,
}: {
  taskId: string;
  phase: "initial" | "final";
  taskTitle: string;
  copyMarkdown: string;
  imageUrl: string | null;
  agentRuns: AgentRunRow[];
  previousCopy: string | null;
  commentHistory: CommentRow[];
  localMode?: boolean;
}) {
  const trigger = useCallback(
    (decision: "approve" | "revision" | "new_direction" | "cancel") => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-approval-action="${decision}"]`,
      );
      el?.click();
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "a") trigger("approve");
      if (k === "r") trigger("revision");
      if (k === "n") trigger("new_direction");
      if (k === "c") trigger("cancel");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger]);

  const title = phase === "initial" ? "Primeira aprovação" : "Aprovação final";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{taskTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Atalhos (fora do campo de comentários): <kbd className="rounded border px-1">A</kbd>{" "}
          aprovar, <kbd className="rounded border px-1">R</kbd> ajuste,{" "}
          <kbd className="rounded border px-1">N</kbd> nova direção,{" "}
          <kbd className="rounded border px-1">C</kbd> cancelar.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {imageUrl ? (
            <Card className="overflow-hidden rounded bg-white shadow dark:bg-card">
              <CardHeader className="border-b py-3">
                <CardTitle className="text-base">Preview visual</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex max-h-[480px] w-full items-center justify-center bg-muted p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="Arte do post"
                    className="max-h-[480px] w-full object-contain"
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded bg-white p-6 text-sm text-muted-foreground shadow dark:bg-card">
              Sem imagem gerada nesta fase (normal na primeira aprovação).
            </Card>
          )}

          <Card className="rounded bg-white shadow dark:bg-card">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Pipeline (agent_runs)</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 space-y-2 overflow-y-auto pt-4 text-sm">
              {agentRuns.length === 0 ? (
                <p className="text-muted-foreground">Nenhum registro ainda.</p>
              ) : (
                agentRuns.map((r) => (
                  <div
                    key={`${r.stage}-${r.finished_at ?? ""}`}
                    className="flex flex-wrap items-center gap-2 border-b border-border/50 py-2 last:border-0"
                  >
                    <Badge variant={r.status === "error" ? "destructive" : "secondary"}>
                      {r.stage}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{r.status}</span>
                    <p className="w-full text-xs text-muted-foreground">
                      {(r.output_summary ?? "").slice(0, 280)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded bg-white shadow dark:bg-card">
            <CardHeader className="border-b">
              <CardTitle className="text-base">
                {phase === "initial" ? "Resumo / direção" : "Copy"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-4 text-sm text-muted-foreground dark:border-gray-700 dark:bg-muted/30">
                {copyMarkdown}
              </pre>
            </CardContent>
          </Card>

          {previousCopy && phase === "final" ? (
            <Card className="rounded bg-white shadow dark:bg-card">
              <CardHeader className="border-b">
                <CardTitle className="text-base">Versão anterior (diff rápido)</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-dashed p-3 text-xs text-muted-foreground">
                  {previousCopy}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          {commentHistory.length > 0 ? (
            <Card className="rounded bg-white shadow dark:bg-card">
              <CardHeader className="border-b">
                <CardTitle className="text-base">Histórico de comentários</CardTitle>
              </CardHeader>
              <CardContent className="max-h-40 space-y-2 overflow-y-auto pt-4 text-xs">
                {commentHistory.map((c) => (
                  <div key={c.id} className="border-b border-border/40 pb-2 last:border-0">
                    <span className="font-medium">{c.status}</span> —{" "}
                    {new Date(c.created_at).toLocaleString("pt-BR")}
                    {c.comments ? (
                      <p className="mt-1 text-muted-foreground">{c.comments}</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded bg-white shadow dark:bg-card">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Decisão</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <ApprovalForm taskId={taskId} phase={phase} localMode={localMode} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
