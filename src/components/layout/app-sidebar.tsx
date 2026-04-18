"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Plug,
  Settings2,
  Users,
  Workflow,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

/**
 * Operação — fluxo lógico: visão → planejar (campanha/calendário) → produzir → aprovar → acompanhar.
 * Configuração — tudo que define o workspace antes ou ao lado do dia a dia.
 */
const operationNav: NavItem[] = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campanhas", icon: CalendarDays },
  { href: "/calendar", label: "Calendário editorial", icon: CalendarRange },
  { href: "/content", label: "Conteúdo", icon: FileText },
  { href: "/approvals", label: "Aprovações", icon: ClipboardList },
  { href: "/operations", label: "Filas e pipeline", icon: Workflow },
  { href: "/observability", label: "Métricas", icon: BarChart3 },
  { href: "/logs", label: "Logs de auditoria", icon: Activity },
];

const configurationNav: NavItem[] = [
  { href: "/playbook", label: "Playbook e voz", icon: BookOpen },
  { href: "/team", label: "Time de agentes", icon: Bot },
  { href: "/integrations", label: "Integrações", icon: Plug },
  { href: "/settings/ai", label: "Modelos e IA", icon: Settings2 },
  { href: "/settings/users", label: "Usuários do workspace", icon: Users },
];

function NavLinks({
  items,
  pathname,
  onNavigate,
  pendingApprovalsCount = 0,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  pendingApprovalsCount?: number;
}) {
  return items.map((item) => {
    const Icon = item.icon;
    const active =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href));
    const badge =
      item.href === "/approvals" && pendingApprovalsCount > 0
        ? pendingApprovalsCount
        : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => onNavigate?.()}
        className={cn(
          "flex items-center gap-3 border-l-[3px] px-4 py-2.5 text-sm transition-colors",
          active
            ? "border-l-primary bg-sidebar-accent text-white"
            : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
        {badge != null ? (
          <span className="shrink-0 rounded-full bg-[#dd4b39] px-2 py-0.5 text-[10px] font-semibold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    );
  });
}

export function AppSidebar({
  isOpen,
  onNavigate,
  currentUser,
  pendingApprovalsCount = 0,
}: {
  isOpen: boolean;
  onNavigate?: () => void;
  currentUser?: {
    name: string;
    email: string;
  };
  pendingApprovalsCount?: number;
}) {
  const pathname = usePathname();
  const displayName = currentUser?.name || "Kolmena Brand";
  const displayEmail = currentUser?.email || "marketing@agentbee.local";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "KB";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[230px] flex-shrink-0 flex-col text-white transition-transform duration-300 ease-out",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
      style={{
        backgroundColor: "var(--sidebar)",
        ...(!isOpen ? { visibility: "hidden" as const } : {}),
      }}
    >
      <div
        className="flex h-[50px] items-center px-4"
        style={{ backgroundColor: "#0C263E" }}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-white"
          onClick={() => onNavigate?.()}
        >
          <Image
            src="/agentbee-logo.png"
            alt="AgentBee"
            width={28}
            height={28}
            className="h-7 w-7 rounded-sm object-cover"
          />
          <span className="text-lg font-bold">AgentBee</span>
        </Link>
      </div>

      <div className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">{displayName}</div>
            <div className="truncate text-xs text-sidebar-foreground">
              {displayEmail}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#4b646f]">
          Operação
        </div>
        <NavLinks
          items={operationNav}
          pathname={pathname}
          onNavigate={onNavigate}
          pendingApprovalsCount={pendingApprovalsCount}
        />

        <div className="mt-4 border-t border-sidebar-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#4b646f]">
          Configuração
        </div>
        <NavLinks items={configurationNav} pathname={pathname} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3 text-xs text-sidebar-foreground">
        Marketing MVP
      </div>
    </aside>
  );
}
