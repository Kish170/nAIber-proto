import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sessions" }

export default function SessionsPage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
        Sessions
      </h1>
      <p className="text-warm-500 text-sm">
        Session history list — click through to individual session detail.
      </p>
    </div>
  )
}
