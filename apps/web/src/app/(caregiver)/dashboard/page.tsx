import type { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
        Dashboard
      </h1>
      <p className="text-warm-500 text-sm">Overview, stability index, and session history.</p>
    </div>
  )
}
