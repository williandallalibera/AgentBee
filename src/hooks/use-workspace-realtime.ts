"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function webRealtimeEnabled() {
  return process.env.NEXT_PUBLIC_WEB_REALTIME_ENABLED?.trim() !== "false";
}

export type PublicationRealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export type WorkspaceRealtimeOptions = {
  /** Chamado após debounce de refresh, para toasts / badges (ex.: publicações). */
  onPublicationChange?: (payload: PublicationRealtimePayload) => void;
};

/**
 * Escuta mudanças nas tabelas do workspace e faz debounce de `router.refresh()`.
 */
export function useWorkspaceRealtime(
  workspaceId: string | null | undefined,
  options?: WorkspaceRealtimeOptions,
) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPublicationChangeRef = useRef(options?.onPublicationChange);
  onPublicationChangeRef.current = options?.onPublicationChange;

  useEffect(() => {
    if (!webRealtimeEnabled() || !workspaceId) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`agentbee-ws-${workspaceId}`);
    const filter = `workspace_id=eq.${workspaceId}`;

    const tables = [
      "approvals",
      "publications",
      "content_tasks",
      "calendar_items",
      "agent_runs",
    ] as const;

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        router.refresh();
      }, 1500);
    };

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        (payload) => {
          scheduleRefresh();
          if (table === "publications") {
            onPublicationChangeRef.current?.(payload as PublicationRealtimePayload);
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, router]);
}
