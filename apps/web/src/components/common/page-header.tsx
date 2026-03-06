import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { Logo } from "@/components/common/logo"
import { Button } from "@/components/ui/button"

export interface NavItem {
  label: string
  href: string
  active?: boolean
}

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  variant?: "public" | "caregiver" | "elderly" | "plain" | "transparent"
  navItems?: NavItem[]
}

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (
    { className, variant = "public", navItems = [], children, ...props },
    ref
  ) => {
    if (variant === "transparent") {
      return (
        <header
          ref={ref}
          className={cn(
            "absolute inset-x-0 top-0 z-50 flex items-center justify-center px-6 py-5",
            className
          )}
          {...props}
        >
          <Logo light />
        </header>
      )
    }

    if (variant === "plain") {
      return (
        <header
          ref={ref}
          className={cn(
            "flex items-center px-6 py-4 border-b border-border bg-background",
            className
          )}
          {...props}
        >
          <Logo />
        </header>
      )
    }

    return (
      <header
        ref={ref}
        className={cn(
          "flex items-center justify-between px-6 h-16 border-b border-border bg-background",
          className
        )}
        {...props}
      >
        <Logo />

        <div className="flex items-center gap-4">

          {navItems.length > 0 && (
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    item.active
                      ? "text-teal bg-teal-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {variant === "public" && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          )}

          {children}
        </div>
      </header>
    )
  }
)
PageHeader.displayName = "PageHeader"

export { PageHeader }