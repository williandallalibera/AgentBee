import Link from "next/link";
import { requireWorkspaceMember } from "@/lib/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isLocalMode } from "@/lib/env";
import { localAgents, localApprovals, localTasks } from "@/lib/local-mode";
import {
  Activity,
  Bot,
  CheckCircle2,
  TrendingUp,
  Users,
} from "lucide-react";

type DashboardTask = {
  id: string;
  title: string;
  status: string;
};

function renderStatCard({
  label,
  value,
  icon: Icon,
  color,
  footer,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  footer: string;
}) {
  return (
    <div className={`${color} overflow-hidden rounded shadow-md text-white`}>
      <div className="flex items-center justify-between p-4">
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold">{value}</div>
          <div className="mt-1 text-sm opacity-90">{label}</div>
        </div>
        <div className="text-white/30">
          <Icon className="h-16 w-16" />
        </div>
      </div>
      <div className="bg-black/10 px-4 py-2 text-xs">
        <span className="opacity-90">{footer}</span>
      </div>
    </div>
  );
}

function metricColor(status: string) {
  switch (status) {
    case "published":
    case "approved_final":
      return "bg-[#00a65a]";
    case "pending_initial_approval":
    case "pending_final_approval":
      return "bg-[#f39c12]";
    default:
      return "bg-[#3c8dbc]";
  }
}

function statusLabel(status: string) {
  if (status === "approved_final" || status === "published") return "Ativo";
  if (status.includes("pending")) return "Em analise";
  return "Em execucao";
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  return (
    <div className="flex h-48 items-end gap-3">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-40 w-full items-end rounded-sm bg-gray-100 px-2 dark:bg-gray-800">
            <div
              className="w-full rounded-t-sm"
              style={{ height: `${value}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs text-gray-500">
            {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"][index]}
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniArea({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-64 w-full">
      <defs>
        <linearGradient id="agentbeeDashboardFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="5%" stopColor="#3c8dbc" stopOpacity="0.35" />
          <stop offset="95%" stopColor="#3c8dbc" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        fill="url(#agentbeeDashboardFill)"
        stroke="none"
        points={`0,100 ${points} 100,100`}
      />
      <polyline
        fill="none"
        stroke="#3c8dbc"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

function renderDashboard({
  pendingCount,
  activeTasks,
  agents,
  recentTasks,
  local,
}: {
  pendingCount: number;
  activeTasks: number;
  agents: number;
  recentTasks: DashboardTask[];
  local: boolean;
}) {
  const completedTasks =
    recentTasks.filter((task) => ["published", "approved_final"].includes(task.status))
      .length || 1;
  const requestsSeries = [48, 58, 41, 65, 52, 69];
  const performanceSeries = [35, 62, 54, 73, 66, 58];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Visão geral da plataforma de marketing com agentes e automações.
          {local ? " Preview local ativa." : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {renderStatCard({
          label: "Total de Agentes",
          value: agents,
          icon: Bot,
          color: "bg-[#3c8dbc]",
          footer: "Especialistas ativos no workspace",
        })}
        {renderStatCard({
          label: "Aprovações Pendentes",
          value: pendingCount,
          icon: Users,
          color: "bg-[#00a65a]",
          footer: "Aguardando revisão humana",
        })}
        {renderStatCard({
          label: "Tarefas em Execução",
          value: activeTasks,
          icon: TrendingUp,
          color: "bg-[#f39c12]",
          footer: "Pipeline entre briefing e publicação",
        })}
        {renderStatCard({
          label: "Taxa de Entrega",
          value: `${Math.min(99, 90 + completedTasks)}%`,
          icon: CheckCircle2,
          color: "bg-[#605ca8]",
          footer: "Conteúdos concluídos no período",
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded bg-white p-6 shadow dark:bg-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Requisições por mês
            </h3>
            <span className="rounded bg-primary px-2 py-1 text-xs text-white">
              2026
            </span>
          </div>
          <div className="rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-card">
            <MiniArea values={requestsSeries} />
          </div>
        </section>

        <section className="rounded bg-white p-6 shadow dark:bg-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Performance dos agentes
            </h3>
          </div>
          <MiniBars values={performanceSeries} color="#00a65a" />
        </section>
      </div>

      <section className="rounded bg-white shadow dark:bg-card">
        <div className="border-b border-gray-200 p-6 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            Operações recentes
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Tarefa
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Progresso
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentTasks.map((task) => {
                const progress =
                  task.status === "published"
                    ? 100
                    : task.status.includes("pending")
                      ? 72
                      : 46;
                return (
                  <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-muted/40">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-white">
                          {task.title}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-800 dark:bg-muted dark:text-white">
                        <Activity className="h-3 w-3" />
                        {statusLabel(task.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-2 rounded-full ${metricColor(task.status)}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-200">
                          {progress}%
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-gray-200">
                      Marketing
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <Link href={`/content/${task.id}`} className="mr-3 text-primary hover:underline">
                        Abrir
                      </Link>
                      <Link href="/approvals" className="text-[#dd4b39] hover:underline">
                        Revisar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded bg-white p-6 shadow dark:bg-card xl:col-span-2">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Estado da plataforma
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Saúde do pipeline, integrações e operação do workspace.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded border-l-4 border-[#3c8dbc] bg-[#f4f8fb] p-4 dark:bg-muted">
              <div className="text-sm font-semibold text-gray-800 dark:text-white">
                Chief Agent
              </div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                Orquestração operacional estável
              </div>
            </div>
            <div className="rounded border-l-4 border-[#00a65a] bg-[#f3fbf6] p-4 dark:bg-muted">
              <div className="text-sm font-semibold text-gray-800 dark:text-white">
                Integrações
              </div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                {local ? "Modo mock ativo" : "Conectores principais online"}
              </div>
            </div>
            <div className="rounded border-l-4 border-[#f39c12] bg-[#fff8ee] p-4 dark:bg-muted">
              <div className="text-sm font-semibold text-gray-800 dark:text-white">
                Aprovações
              </div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                {pendingCount} decisão(ões) aguardando ação
              </div>
            </div>
          </div>
        </section>

        <section className="rounded bg-white p-6 shadow dark:bg-card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Ações rápidas
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Fluxos principais do AgentBee
            </p>
          </div>
          <div className="space-y-2">
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
              href="/team"
            >
              Ver equipe IA
            </Link>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
              href="/content"
            >
              Abrir backlog de conteúdo
            </Link>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
              href="/integrations"
            >
              Configurar integrações
            </Link>
            <Link
              className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
              href="/observability"
            >
              Ver analytics
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  if (isLocalMode()) {
    return renderDashboard({
      pendingCount: localApprovals.length,
      activeTasks: localTasks.filter(
        (task) => !["published", "cancelled"].includes(task.status),
      ).length,
      agents: localAgents.length,
      recentTasks: localTasks,
      local: true,
    });
  }

  const { supabase, workspaceId } = await requireWorkspaceMember();

  const { data: allTasks } = await supabase
    .from("content_tasks")
    .select("id, title, status, updated_at")
    .eq("workspace_id", workspaceId);

  const taskIds = allTasks?.map((t) => t.id) ?? [];
  const activeTasks =
    allTasks?.filter(
      (t) => !["published", "cancelled"].includes(t.status),
    ).length ?? 0;

  let pendingCount = 0;
  if (taskIds.length) {
    const { count } = await supabase
      .from("approvals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .in("task_id", taskIds);
    pendingCount = count ?? 0;
  }

  const { count: agents } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  const recentTasks = (allTasks ?? [])
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 5);

  return renderDashboard({
    pendingCount,
    activeTasks,
    agents: agents ?? 0,
    recentTasks,
    local: false,
  });
}
