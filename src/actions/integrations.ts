"use server";

import { requireWorkspaceMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import type { IntegrationProvider } from "@/lib/types/database";

export async function updateIntegration(input: {
  provider: IntegrationProvider;
  status?: string;
  config: Record<string, unknown>;
}) {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { error } = await supabase.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: input.provider,
      status: input.status ?? "connected",
      config_metadata_json: input.config,
      last_tested_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,provider" },
  );

  if (error) return { error: error.message };
  revalidatePath("/integrations");
  return { ok: true };
}
