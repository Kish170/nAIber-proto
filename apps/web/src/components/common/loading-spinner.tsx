import { cn } from "@/lib/utils"

const sizeMap = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-[3px]",
}

interface LoadingSpinnerProps {
  size?: keyof typeof sizeMap
  className?: string
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "rounded-full border-warm-300 border-t-teal animate-spin",
        sizeMap[size],
        className
      )}
    />
  )
}
