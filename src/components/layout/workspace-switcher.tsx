"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Ws = { id: string; name: string };

export function WorkspaceSwitcher({
  workspaces,
  currentId,
  localMode = false,
}: {
  workspaces: Ws[];
  currentId: string | null;
  localMode?: boolean;
}) {
  const router = useRouter();
  const current = workspaces.find((w) => w.id === currentId);

  async function switchWs(id: string) {
    if (localMode) return;
    const { switchWorkspace } = await import("@/actions/workspace");
    const r = await switchWorkspace(id);
    if ("ok" in r && r.ok) router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hidden min-w-[220px] items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 sm:flex dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800",
        )}
      >
        {current?.name ?? "Selecionar workspace"}
        <ChevronDown className="size-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onClick={() => switchWs(w.id)}
            disabled={localMode}
          >
            {w.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
