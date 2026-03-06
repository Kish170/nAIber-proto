import Link from "next/link"
import { Button } from "@/components/ui/button"

export function CtaBanner() {
  return (
    <section className="bg-teal">
      <div className="max-w-[1100px] mx-auto px-8 py-20 text-center">
        <h2
          className="font-display font-medium text-ivory leading-snug mb-4"
          style={{ fontSize: "2rem" }}
        >
          Start with one conversation.
        </h2>
        <p
          className="text-ivory leading-relaxed mb-8 mx-auto"
          style={{ fontSize: "1rem", opacity: 0.8, maxWidth: 440 }}
        >
          No hardware, no app installs. nAIber works with any phone your loved
          one already has.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button
            size="lg"
            className="bg-ivory text-teal hover:bg-ivory/90 font-medium"
            asChild
          >
            <Link href="/signup">Get started free</Link>
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="text-ivory hover:bg-white/10 hover:text-ivory"
            asChild
          >
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
