"use client"

import Link from "next/link"
import { Settings } from "lucide-react"
import { useSession } from "next-auth/react"

import { Logo } from "@/components/common/logo"
import { SidebarNav } from "./sidebar-nav"
import { UserSwitcher } from "./user-switcher"

export function CaregiverShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const name = session?.user?.name ?? "Your account"
  const initial = name.charAt(0).toUpperCase()

  return (
    <div className="flex h-screen bg-ivory overflow-hidden">

      <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-white">

        <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
          <Logo />
        </div>

        <UserSwitcher />

        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>

        <div className="px-4 py-4 border-t border-border shrink-0">
          <div className="bg-ivory rounded-xl px-3 py-2 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-teal flex items-center justify-center shrink-0">
              <span className="text-xs text-ivory font-medium">{initial}</span>
            </div>
            <span className="text-xs text-warm-700 font-medium flex-1 truncate">{name}</span>
            <Link href="/settings" className="text-warm-500 hover:text-warm-700 transition-colors">
              <Settings size={14} />
            </Link>
          </div>
        </div>

      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

    </div>
  )
}
