"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useWorkspaceRealtime,
  webRealtimeEnabled,
} from "@/hooks/use-workspace-realtime";
import type { PublicationRealtimePayload } from "@/hooks/use-workspace-realtime";

type ToastState = { variant: "success" | "error"; message: string } | null;

/**
 * Efeitos colaterais de Realtime: atualização de rota (via hook) + toasts discretos em publicações.
 */
export function RealtimeBadges({
  workspaceId,
  localMode = false,
}: {
  workspaceId: string | null;
  localMode?: boolean;
}) {
  const [toast, setToast] = useState<ToastState>(null);

  const onPublicationChange = useCallback((payload: PublicationRealtimePayload) => {
    if (!webRealtimeEnabled()) return;
    const row = payload.new as Record<string, unknown> | null;
    const status = typeof row?.status === "string" ? row.status : null;
    if (status === "published") {
      setToast({ variant: "success", message: "Publicação concluída." });
    } else if (status === "failed") {
      setToast({
        variant: "error",
        message: "Falha em uma publicação — confira o painel.",
      });
    }
  }, []);

  useWorkspaceRealtime(localMode ? null : workspaceId, {
    onPublicationChange,
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
        toast.variant === "success"
          ? "border-emerald-700/40 bg-emerald-950/95 text-emerald-50"
          : "border-red-700/40 bg-red-950/95 text-red-50"
      }`}
    >
      {toast.message}
    </div>
  );
}
