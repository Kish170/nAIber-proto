import * as React from "react"
import { Heart } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const sizeMap = {
  sm:      { circle: "w-6 h-6",   iconPx: 10, text: "text-sm"  },
  default: { circle: "w-8 h-8",   iconPx: 15, text: "text-xl"  },
  lg:      { circle: "w-10 h-10", iconPx: 18, text: "text-2xl" },
} as const

const logoVariants = cva("inline-flex items-center", {
  variants: {
    variant: {
      full: "gap-2",
      mark: "",
    },
  },
  defaultVariants: {
    variant: "full",
  },
})

export interface LogoProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof logoVariants> {
  size?: keyof typeof sizeMap
  light?: boolean
}

const Logo = React.forwardRef<HTMLDivElement, LogoProps>(
  ({ className, variant, size = "default", light = false, ...props }, ref) => {
    const { circle, iconPx, text } = sizeMap[size]

    return (
      <div
        ref={ref}
        className={cn(logoVariants({ variant }), className)}
        {...props}
      >
        <div
          className={cn(
            "shrink-0 rounded-full flex items-center justify-center bg-teal",
            circle
          )}
        >
          <Heart
            size={iconPx}
            className={light ? "text-white fill-white" : "text-ivory fill-ivory"}
          />
        </div>

        {variant !== "mark" && (
          <span
            className={cn(
              "font-display font-medium",
              text,
              light ? "text-white" : "text-warm-900"
            )}
          >
            n
            <span className={light ? "text-white" : "text-teal"}>AI</span>
            ber
          </span>
        )}
      </div>
    )
  }
)
Logo.displayName = "Logo"

export { Logo, logoVariants }