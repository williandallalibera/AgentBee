"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_AGENTS } from "@/lib/agents/defaults";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function createWorkspace(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Nome obrigatório");
  }

  const { user } = await requireUser();
  const service = createServiceSupabaseClient();

  const base = slugify(name);
  let slug = base || "workspace";
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await service
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: ws, error: wErr } = await service
    .from("workspaces")
    .insert({ name, slug })
    .select("id")
    .single();

  if (wErr || !ws) {
    throw new Error(wErr?.message ?? "Falha ao criar workspace");
  }

  const { error: mErr } = await service.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: user.id,
    role: "admin",
  });

  if (mErr) {
    throw new Error(mErr.message);
  }

  const { error: bErr } = await service.from("brands").insert({
    workspace_id: ws.id,
    name: "Kolmena",
    description: "Marca principal",
  });

  if (bErr) {
    /* não bloqueia — brand opcional no fluxo */
  }

  await service.from("agents").insert(
    DEFAULT_AGENTS.map((a) => ({
      workspace_id: ws.id,
      name: a.name,
      role: a.role,
      department: a.department,
      autonomy_level: a.autonomy_level,
      instructions_markdown: a.instructions_markdown,
      is_active: true,
    })),
  );

  const integrationProviders = [
    "openai",
    "google_chat",
    "google_workspace",
    "instagram",
    "linkedin",
  ] as const;
  await service.from("integrations").insert(
    integrationProviders.map((provider) => ({
      workspace_id: ws.id,
      provider,
      status: "disconnected",
      config_metadata_json: {},
    })),
  );

  await setWorkspaceCookie(ws.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function setWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function switchWorkspace(workspaceId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { error: "Sem acesso a este workspace" };

  await setWorkspaceCookie(workspaceId);
  revalidatePath("/", "layout");
  return { ok: true };
}
