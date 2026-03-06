"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Activity, PhoneCall, User, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "Dashboard",    href: "/dashboard",    icon: LayoutDashboard },
  { label: "Sessions",     href: "/sessions",     icon: PhoneCall },
  { label: "Observations", href: "/observations", icon: Activity },
  { label: "Profile",      href: "/profile",      icon: User },
  { label: "Settings",     href: "/settings",     icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/")
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-teal-muted text-teal"
                : "text-warm-700 hover:bg-ivory-deep hover:text-warm-900"
            )}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
