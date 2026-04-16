"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { triggerContentPipeline } from "@/actions/pipeline";

export function PipelineButton({
  taskId,
  localMode = false,
}: {
  taskId: string;
  localMode?: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (localMode) {
      setMsg("Modo local: pipeline desabilitado.");
      return;
    }
    setLoading(true);
    setMsg(null);
    const r = await triggerContentPipeline(taskId);
    setLoading(false);
    if ("error" in r && r.error) setMsg(r.error);
    else setMsg("Pipeline disparado. Acompanhe em Operações e Aprovações.");
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={run} disabled={loading}>
        {loading ? "Disparando…" : "Iniciar pipeline de conteúdo"}
      </Button>
      {msg ? <p className="text-muted-foreground text-sm">{msg}</p> : null}
    </div>
  );
}
