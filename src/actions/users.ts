"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const { workspaceId, role } = await requireWorkspaceMember();
  if (role !== "admin") return { error: "Apenas admin pode criar usuários." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || !email || !password) {
    return { error: "Nome, e-mail e senha são obrigatórios." };
  }
  if (password.length < 6) {
    return { error: "A senha deve ter no mínimo 6 caracteres." };
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) return { error: error?.message ?? "Falha ao criar usuário." };

  await service
    .from("profiles")
    .upsert(
      { id: data.user.id, full_name: name },
      { onConflict: "id" },
    );

  const { error: membershipError } = await service
    .from("workspace_members")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: data.user.id,
        role: "admin",
      },
      { onConflict: "workspace_id,user_id" },
    );

  if (membershipError) return { error: membershipError.message };

  revalidatePath("/settings/users");
  return { ok: true };
}

export async function changeUserPassword(input: {
  userId: string;
  newPassword: string;
}) {
  const { workspaceId, role, supabase } = await requireWorkspaceMember();
  if (role !== "admin") return { error: "Apenas admin pode alterar senhas." };

  const userId = input.userId;
  const newPassword = input.newPassword;
  if (!userId || !newPassword) return { error: "Usuário e nova senha são obrigatórios." };
  if (newPassword.length < 6) {
    return { error: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) {
    return { error: "Usuário não pertence ao workspace atual." };
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings/users");
  return { ok: true };
}

export async function updateAdminUser(input: {
  userId: string;
  name: string;
  email: string;
  newPassword?: string;
}) {
  const { workspaceId, role, supabase } = await requireWorkspaceMember();
  if (role !== "admin") return { error: "Apenas admin pode editar usuários." };

  const userId = input.userId;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const newPassword = input.newPassword?.trim();

  if (!userId || !name || !email) {
    return { error: "Nome, e-mail e usuário são obrigatórios." };
  }
  if (newPassword && newPassword.length < 6) {
    return { error: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) {
    return { error: "Usuário não pertence ao workspace atual." };
  }

  const service = createServiceSupabaseClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    email,
    password: newPassword || undefined,
    user_metadata: { full_name: name },
  });
  if (error) return { error: error.message };

  await service
    .from("profiles")
    .upsert({ id: userId, full_name: name }, { onConflict: "id" });

  revalidatePath("/settings/users");
  return { ok: true };
}
