import { Logo } from "@/components/common/logo"
import { SidebarNav } from "./sidebar-nav"

export function CaregiverShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-ivory overflow-hidden">

      <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-white">
        <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
          <Logo />
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0">
          <div className="h-8 rounded bg-ivory-deep" />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

    </div>
  )
}