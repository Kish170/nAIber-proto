import type { Metadata } from "next"

export const metadata: Metadata = { title: "Home" }

export default function ElderlyHomePage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-medium text-warm-900 text-3xl mb-3">
        Hello, Dorothy.
      </h1>
      <p className="text-warm-700">
        Last check-in summary, next scheduled call, consistency indicator.
      </p>
    </div>
  )
}
