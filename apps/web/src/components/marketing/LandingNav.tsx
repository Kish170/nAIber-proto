import Link from "next/link"
import { Logo } from "@/components/common/logo"
import { Button } from "@/components/ui/button"

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "For families", href: "#for-families" },
  { label: "Privacy",      href: "#privacy" },
]

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 bg-ivory border-b border-border">
      <div className="max-w-[1100px] mx-auto px-8 h-16 flex items-center justify-between">
        <Logo />

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-warm-700 hover:text-warm-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" className="bg-teal text-ivory hover:bg-teal-light" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}