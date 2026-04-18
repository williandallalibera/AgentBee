import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadSocialAssetPng(input: {
  supabase: SupabaseClient;
  workspaceId: string;
  taskId: string;
  bytes: Uint8Array;
  filename?: string;
}): Promise<string | null> {
  const name = input.filename ?? "social-banner.png";
  const path = `${input.workspaceId}/${input.taskId}/${name}`;
  const { error } = await input.supabase.storage.from("social-assets").upload(path, input.bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) {
    console.warn("social_art_upload_failed", error.message);
    return null;
  }
  const { data } = input.supabase.storage.from("social-assets").getPublicUrl(path);
  return data.publicUrl ?? null;
}
