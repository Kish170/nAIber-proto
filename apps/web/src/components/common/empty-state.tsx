import React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface EmptyStateProps {
  icon: React.ElementType
  heading: string
  description?: string
  action?: {
    label: string
    href: string
  }
  className?: string
  compact?: boolean
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-14 px-6",
        className
      )}
    >
      <div className={cn("rounded-full bg-ivory flex items-center justify-center mb-4", compact ? "w-10 h-10" : "w-14 h-14")}>
        <Icon
          size={compact ? 20 : 28}
          className="text-warm-300"
          strokeWidth={1.5}
        />
      </div>
      <p className={cn("font-medium text-warm-900 mb-1", compact ? "text-sm" : "text-base")}>
        {heading}
      </p>
      {description && (
        <p className={cn("text-warm-500 max-w-xs", compact ? "text-xs" : "text-sm")}>
          {description}
        </p>
      )}
      {action && (
        <Button
          asChild
          className="mt-5 bg-teal text-ivory hover:bg-teal-light"
          size={compact ? "sm" : "default"}
        >
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}
