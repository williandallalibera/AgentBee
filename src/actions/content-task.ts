"use server";

import { createContentTaskCore } from "@/lib/content/create-task-core";
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

  const result = await createContentTaskCore(supabase, {
    workspaceId,
    title: input.title,
    campaignId: input.campaignId ?? null,
    requestedByUserId: user.id,
  });

  if ("error" in result) return result;
  revalidatePath("/content");
  return { id: result.taskId };
}
