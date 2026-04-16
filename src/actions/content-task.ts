"use server";

import { requireWorkspaceMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function createContentTaskFromForm(
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const r = await createContentTask({ title });
  if ("error" in r && r.error) {
    throw new Error(r.error);
  }
}

export async function createContentTask(input: {
  title: string;
  campaignId?: string | null;
}) {
  const { supabase, user, workspaceId } = await requireWorkspaceMember();

  const { data, error } = await supabase
    .from("content_tasks")
    .insert({
      workspace_id: workspaceId,
      title: input.title,
      campaign_id: input.campaignId ?? null,
      status: "draft",
      requested_by: user.id,
      current_stage: "briefing",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/content");
  return { id: data.id };
}
