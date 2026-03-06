import Link from "next/link"
import { Button } from "@/components/ui/button"

const HERO_PHOTO =
  "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=1080"

export function Hero() {
  return (
    <section className="max-w-[1100px] mx-auto px-8 pt-20 pb-28">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-teal" />
            <span className="text-xs text-warm-700">Cognitive wellness companion</span>
          </div>

          <h1
            className="font-display font-medium text-warm-900 leading-tight mb-5"
            style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)" }}
          >
            A quiet neighbor{" "}
            <em className="text-teal">for the people</em>{" "}
            you love.
          </h1>

          <p
            className="text-warm-700 leading-relaxed mb-8 max-w-[440px]"
            style={{ fontSize: "1rem" }}
          >
            nAIber gently checks in with elderly loved ones through simple
            phone calls — and helps you notice subtle changes before they
            become concerns.
          </p>

          <div className="flex items-center gap-3 flex-wrap mb-10">
            <Button size="lg" className="bg-teal text-ivory hover:bg-teal-light" asChild>
              <Link href="/signup">Start for free →</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#how-it-works">See a demo</Link>
            </Button>
          </div>
        </div>

        <div className="relative mt-8 md:mt-0">
          <div className="rounded-3xl overflow-hidden aspect-[3/4] w-full shadow-elevated">
            <img
              src={HERO_PHOTO}
              alt="Warm home environment"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="absolute top-4 right-4 bg-white rounded-full shadow-card px-3 py-1.5 flex items-center gap-2">
            <span className="text-xs">⭐</span>
            <span className="text-xs font-medium text-warm-900">Stable trends</span>
          </div>

          <div className="absolute -bottom-8 left-6 bg-white rounded-2xl shadow-elevated px-5 py-4 max-w-[230px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-teal" />
              <span className="text-xs text-warm-500">Just checked in</span>
            </div>
            <p className="text-sm font-medium text-warm-900 leading-snug mb-1">
              Dorothy seemed cheerful today.
            </p>
            <span className="text-xs text-warm-500">Today, 3:14 PM</span>
          </div>
        </div>

      </div>
    </section>
  )
}