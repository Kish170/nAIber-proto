import Link from "next/link"
import { Logo } from "@/components/common/logo"

const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "For families", href: "#for-families" },
  { label: "Privacy", href: "#privacy" },
  { label: "Terms", href: "/terms" },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-ivory">
      <div className="max-w-[1100px] mx-auto px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <Logo size="sm" />

        <nav className="flex items-center gap-6 flex-wrap justify-center">
          {LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-warm-500 hover:text-warm-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        <p className="text-xs text-warm-400">
          © {new Date().getFullYear()} nAIber. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
