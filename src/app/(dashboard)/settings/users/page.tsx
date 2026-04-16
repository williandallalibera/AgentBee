import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { UserAdminPanel } from "@/components/users/user-admin-panel";
import { isLocalMode } from "@/lib/env";

type UserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export default async function UsersSettingsPage() {
  if (isLocalMode()) {
    const localUsers: UserRow[] = [
      {
        id: "local-admin",
        name: "Admin Local",
        email: "admin@agentbee.local",
        createdAt: new Date().toISOString(),
      },
    ];
    return <UsersView users={localUsers} localMode />;
  }

  const { workspaceId } = await requireWorkspaceMember();
  const supabase = createServiceSupabaseClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("workspace_members")
    .select("user_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const memberIds = (memberships ?? []).map((item) => item.user_id);
  let users: UserRow[] = [];

  if (memberIds.length > 0) {
    const [{ data: profiles }, authResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberIds),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? ""]));
    const authUsers = authResult.data?.users ?? [];
    const authMap = new Map(authUsers.map((user) => [user.id, user]));

    users = (memberships ?? []).map((membership) => {
      const authUser = authMap.get(membership.user_id);
      const profileName = profileMap.get(membership.user_id);
      return {
        id: membership.user_id,
        name: profileName || authUser?.user_metadata?.full_name || authUser?.email || "Usuário",
        email: authUser?.email ?? "sem-email",
        createdAt: membership.created_at,
      };
    });
  }

  return <UsersView users={users} />;
}

function UsersView({
  users,
  localMode = false,
}: {
  users: UserRow[];
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Usuários
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Cadastro básico com perfil único de acesso: admin.
        </p>
      </div>

      <Card className="rounded bg-white shadow dark:bg-card">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle>Gerenciar usuários</CardTitle>
          <CardDescription>
            Visualize em grid, edite por modal e crie novos usuários com cadastro simples.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <UserAdminPanel users={users} localMode={localMode} />
        </CardContent>
      </Card>
    </div>
  );
}
