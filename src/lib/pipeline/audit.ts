import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function writeAudit(input: {
  workspaceId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  actorType: "user" | "system" | "agent";
  actorId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServiceSupabaseClient();
  await supabase.from("audit_logs").insert({
    workspace_id: input.workspaceId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    actor_type: input.actorType,
    actor_id: input.actorId,
    metadata_json: input.metadata ?? {},
  });
}
