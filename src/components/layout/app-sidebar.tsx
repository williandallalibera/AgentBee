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

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/team", label: "Agentes de IA", icon: Bot, badge: "6" },
  { href: "/observability", label: "Analytics", icon: BarChart3 },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/campaigns", label: "Campanhas", icon: CalendarDays },
  { href: "/calendar", label: "Calendário", icon: CalendarRange },
  { href: "/content", label: "Conteúdo", icon: FileText },
  { href: "/approvals", label: "Aprovações", icon: ClipboardList },
  { href: "/operations", label: "Operações", icon: Workflow },
  { href: "/logs", label: "Logs", icon: Activity },
  { href: "/integrations", label: "Integrações", icon: Plug },
  { href: "/settings/ai", label: "Config IA", icon: Settings2 },
  { href: "/settings/users", label: "Usuários", icon: Users },
];

export function AppSidebar({
  isOpen,
  onNavigate,
  currentUser,
}: {
  isOpen: boolean;
  onNavigate?: () => void;
  currentUser?: {
    name: string;
    email: string;
  };
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
        <div className="px-3 py-2 text-xs font-semibold uppercase text-[#4b646f]">
          Menu Principal
        </div>
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
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
              <Icon className="h-5 w-5" />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge ? (
                <span className="rounded-full bg-[#00a65a] px-2 py-0.5 text-xs text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3 text-xs text-sidebar-foreground">
        Marketing MVP
      </div>
    </aside>
  );
}
