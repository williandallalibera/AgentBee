"use server";

import { requireWorkspaceMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function upsertPlaybookDocument(formData: FormData): Promise<void> {
  const { supabase, user, workspaceId } = await requireWorkspaceMember();

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  if (!title) {
    throw new Error("Título obrigatório");
  }

  const { error } = await supabase.from("playbook_documents").insert({
    workspace_id: workspaceId,
    title,
    content_markdown: content,
    type: "general",
    created_by: user.id,
    version_number: 1,
  });

  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/playbook");
}
