"use server";

import { requireWorkspaceMember } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function createCampaignFromForm(
  formData: FormData,
): Promise<void> {
  const r = await createCampaign({
    name: String(formData.get("name") ?? "").trim(),
    objective: String(formData.get("objective") ?? "").trim(),
  });
  if ("error" in r && r.error) {
    throw new Error(r.error);
  }
}

export async function createCampaign(input: { name: string; objective: string }) {
  const { supabase, workspaceId } = await requireWorkspaceMember();

  if (!input.name) return { error: "Nome obrigatório" };

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (!brand) return { error: "Marca não encontrada — crie o workspace novamente." };

  const { error } = await supabase.from("campaigns").insert({
    brand_id: brand.id,
    name: input.name,
    objective: input.objective || null,
    status: "active",
  });

  if (error) return { error: error.message };
  revalidatePath("/campaigns");
  return { ok: true };
}
