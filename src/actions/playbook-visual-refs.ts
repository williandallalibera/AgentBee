"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceMember } from "@/lib/auth/session";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["png", "jpg", "jpeg", "webp"]);

export async function uploadPlaybookVisualReference(formData: FormData): Promise<void> {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Envie uma imagem (PNG, JPG ou WebP).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Arquivo muito grande (máx. 5 MB).");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.has(ext)) {
    throw new Error("Formato não suportado. Use PNG, JPG ou WebP.");
  }

  const title = String(formData.get("title") ?? "Referência visual").trim() || "Referência visual";
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw.length > 0 ? notesRaw : null;

  const path = `${workspaceId}/refs/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage.from("playbook-assets").upload(path, buf, {
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: false,
  });
  if (upErr) {
    throw new Error(upErr.message);
  }

  const { error: insErr } = await supabase.from("playbook_visual_references").insert({
    workspace_id: workspaceId,
    title,
    notes,
    storage_path: path,
  });
  if (insErr) {
    throw new Error(insErr.message);
  }

  revalidatePath("/playbook");
}

export async function deletePlaybookVisualReference(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    throw new Error("ID inválido.");
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: row, error: fetchErr } = await supabase
    .from("playbook_visual_references")
    .select("id, workspace_id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row || row.workspace_id !== workspaceId) {
    throw new Error("Referência não encontrada.");
  }

  await supabase.storage.from("playbook-assets").remove([row.storage_path as string]);

  const { error: delErr } = await supabase.from("playbook_visual_references").delete().eq("id", id);
  if (delErr) {
    throw new Error(delErr.message);
  }

  revalidatePath("/playbook");
}
