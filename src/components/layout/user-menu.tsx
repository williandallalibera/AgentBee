"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";

export function UserMenu({
  localMode = false,
  userName,
  userEmail,
}: {
  localMode?: boolean;
  userName?: string;
  userEmail?: string;
}) {
  const router = useRouter();

  async function signOut() {
    if (localMode) {
      router.push("/dashboard");
      return;
    }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded px-3 py-2 text-[#222d32] transition-colors hover:bg-[#dea300]">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#222d32]/12">
          <User className="h-4 w-4" />
        </div>
        <span className="hidden text-sm lg:inline">
          {localMode ? "Preview local" : userName || "Admin User"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-sm">
        <div className="border-b border-gray-200 p-3">
          <div className="font-semibold text-gray-800">
            {localMode ? "Preview local" : userName || "Admin User"}
          </div>
          <div className="text-xs text-gray-500">
            {localMode ? "preview@agentbee.local" : userEmail || "workspace@agentbee.app"}
          </div>
        </div>
        <DropdownMenuItem>
          <User className="mr-2 size-4" />
          Perfil
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 size-4" />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="text-[#dd4b39]">
          <LogOut className="mr-2 size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
