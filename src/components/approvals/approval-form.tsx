"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  submitApprovalDecision,
  type ApprovalAction,
} from "@/actions/approvals";
import { useRouter } from "next/navigation";

export function ApprovalForm({
  taskId,
  phase,
  localMode = false,
}: {
  taskId: string;
  phase: "initial" | "final";
  localMode?: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(decision: ApprovalAction) {
    if (localMode) {
      setMsg(`Modo local: ação "${decision}" desabilitada.`);
      return;
    }
    setLoading(true);
    setMsg(null);
    const r = await submitApprovalDecision({
      taskId,
      phase,
      decision,
      comments: comments || undefined,
    });
    setLoading(false);
    if ("error" in r && r.error) {
      setMsg(r.error);
      return;
    }
    router.push("/approvals");
    router.refresh();
  }

  return (
    <div className="grid max-w-3xl gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="space-y-2">
        <Label htmlFor="comments">Comentários (opcional)</Label>
        <Textarea
          id="comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={5}
        />
        {msg ? <p className="text-sm text-destructive">{msg}</p> : null}
      </div>
      <div className="rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Ações
          </p>
          <Button
            type="button"
            disabled={loading}
            onClick={() => act("approve")}
            className="w-full"
          >
            Aprovar
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => act("revision")}
            className="w-full"
          >
            Pedir ajuste
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => act("new_direction")}
            className="w-full"
          >
            Nova direção
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={() => act("cancel")}
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
