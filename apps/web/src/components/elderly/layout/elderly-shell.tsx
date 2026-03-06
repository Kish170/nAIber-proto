"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, User } from "lucide-react"

import { cn } from "@/lib/utils"

const TAB_ITEMS = [
  { label: "Home",    href: "/home",    icon: Home },
  { label: "Profile", href: "/profile", icon: User },
]

export function ElderlyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div data-mode="elderly" className="flex flex-col min-h-screen bg-ivory">

      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-border flex safe-area-inset-bottom">
        {TAB_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 gap-1 min-h-[64px] transition-colors",
                active ? "text-teal" : "text-warm-500"
              )}
            >
              <Icon size={26} strokeWidth={1.8} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>

    </div>
  )
}