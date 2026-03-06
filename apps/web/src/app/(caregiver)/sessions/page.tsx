import type { Metadata } from "next"
import { PhoneCall } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"

export const metadata: Metadata = { title: "Sessions" }

export default function SessionsPage() {
  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Sessions</h1>
          <p className="text-sm text-warm-500">A record of every call nAIber has made.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-9 w-36 bg-white border border-border rounded-lg px-3 flex items-center">
            <span className="text-sm text-warm-500">All outcomes</span>
          </div>
          <div className="h-9 flex items-center gap-2 bg-white border border-border rounded-lg px-3">
            <span className="text-sm text-warm-500">From</span>
            <div className="w-24 h-5 bg-ivory rounded" />
          </div>
          <div className="h-9 flex items-center gap-2 bg-white border border-border rounded-lg px-3">
            <span className="text-sm text-warm-500">To</span>
            <div className="w-24 h-5 bg-ivory rounded" />
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-card">
          <EmptyState
            icon={PhoneCall}
            heading="No sessions yet"
            description="Completed calls will appear here. nAIber will begin calling after activation is confirmed."
            action={{ label: "Go to dashboard", href: "/dashboard" }}
          />
        </div>

      </div>
    </div>
  )
}
