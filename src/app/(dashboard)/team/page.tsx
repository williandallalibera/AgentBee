import { requireWorkspaceMember } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isLocalMode } from "@/lib/env";
import { localAgents } from "@/lib/local-mode";

export default async function TeamPage() {
  if (isLocalMode()) {
    return <TeamPageView agents={localAgents} localMode />;
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: agents } = await supabase
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("department", { ascending: true });

  return <TeamPageView agents={agents ?? []} />;
}

function TeamPageView({
  agents,
  localMode = false,
}: {
  agents: {
    id: string;
    name: string;
    department: string;
    autonomy_level: number;
    is_active: boolean;
    instructions_markdown: string | null;
  }[];
  localMode?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Equipe IA
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Especialistas digitais por função, setor e nível de autonomia.
          {localMode ? " Preview local ativa." : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="rounded bg-white shadow dark:bg-card">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{agent.name}</CardTitle>
                <Badge variant={agent.is_active ? "default" : "secondary"}>
                  {agent.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <CardDescription>
                {agent.department} · Nível {agent.autonomy_level}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {agent.instructions_markdown ?? "—"}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Nível {agent.autonomy_level}</span>
                <span>{agent.department}</span>
              </div>
              <Link
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                href={`/team/${agent.id}`}
              >
                Ficha
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
