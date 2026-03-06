import type { Metadata } from "next"

export const metadata: Metadata = { title: "Observations" }

export default function ObservationsPage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
        Observations
      </h1>
      <p className="text-warm-500 text-sm">
        IQCODE submission summary, last submitted date, update flow, submission history.
      </p>
    </div>
  )
}
