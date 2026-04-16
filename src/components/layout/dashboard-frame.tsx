"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Bell, Menu, Search } from "lucide-react";

export function DashboardFrame({
  children,
  localMode = false,
  currentUser,
}: {
  children: ReactNode;
  localMode?: boolean;
  currentUser?: {
    name: string;
    email: string;
  };
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setIsSidebarOpen(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (!cancelled && window.matchMedia("(min-width: 768px)").matches) {
        setIsSidebarOpen(true);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div
        role="button"
        tabIndex={0}
        aria-label="Fechar menu"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden ${
          isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsSidebarOpen(false)}
        onKeyDown={(event) =>
          event.key === "Escape" && setIsSidebarOpen(false)
        }
      />

      <AppSidebar
        isOpen={isSidebarOpen}
        onNavigate={closeSidebarOnMobile}
        currentUser={currentUser}
      />

      <div
        className={`flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ${
          isSidebarOpen ? "md:ml-[230px]" : ""
        }`}
      >
        <header
          className="sticky top-0 z-30 flex h-[50px] items-center justify-between px-4 text-[#222d32] shadow-md"
          style={{ backgroundColor: "#F6B501" }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((previous) => !previous)}
              className="rounded p-2 text-[#222d32] transition-colors hover:bg-[#dea300] md:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="hidden w-64 items-center gap-2 rounded bg-[#dea300] px-3 py-1.5 md:flex">
              <Search className="h-4 w-4 text-[#222d32]/70" />
              <input
                type="text"
                placeholder="Pesquisar..."
                className="w-full border-none bg-transparent text-sm text-[#222d32] placeholder:text-[#222d32]/70 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              className="relative rounded p-2 text-[#222d32] transition-colors hover:bg-[#dea300]"
              aria-label="Notificações"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#dd4b39]" />
            </button>
            <UserMenu
              localMode={localMode}
              userName={currentUser?.name}
              userEmail={currentUser?.email}
            />
          </div>
        </header>
        <main className="flex-1 overflow-auto overflow-x-hidden p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
