import type { Metadata } from "next"
import { ClipboardList, History } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Observations" }

export default function ObservationsPage() {
  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Observations</h1>
            <p className="text-sm text-warm-500">
              Your structured observations about how your loved one is doing over time.
            </p>
          </div>
          <Button className="bg-teal text-ivory hover:bg-teal-light shrink-0">
            Update observations
          </Button>
        </div>

        <div className="bg-white rounded-2xl shadow-card px-6 py-6">
          <h2 className="font-display font-medium text-warm-900 text-base mb-4">
            Current observations
          </h2>
          <EmptyState
            icon={ClipboardList}
            heading="No observations yet"
            description="Observations are captured during onboarding. You can update them at any time using the button above."
            compact
          />
        </div>

        <div className="bg-white rounded-2xl shadow-card px-6 py-6">
          <h2 className="font-display font-medium text-warm-900 text-base mb-4">
            Submission history
          </h2>
          <EmptyState
            icon={History}
            heading="No previous submissions"
            description="Each time you update your observations, the previous version is saved here."
            compact
          />
        </div>

      </div>
    </div>
  )
}
