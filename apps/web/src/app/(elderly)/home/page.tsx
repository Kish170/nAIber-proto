import type { Metadata } from "next"
import { PhoneCall } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"

export const metadata: Metadata = { title: "Home" }

export default function ElderlyHomePage() {
  return (
    <div className="p-6 flex flex-col gap-5">
=
      <div className="pt-2">
        <h1 className="font-display font-medium text-warm-900 text-3xl leading-snug mb-1">
          Hello, Dorothy.
        </h1>
        <p className="text-warm-500">Welcome to nAIber.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-card px-6 py-6">
        <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-3">Your last chat</p>
        <EmptyState
          icon={PhoneCall}
          heading="No calls yet"
          description="nAIber will reach out soon."
          compact
        />
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="border-l-4 border-teal px-6 py-6">
          <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Your next call</p>
          <p className="text-warm-700 leading-relaxed">
            We'll be in touch once your account is ready.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card px-6 py-6">
        <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">This month</p>
        <p className="text-warm-500 text-sm">Getting started — calls will begin soon.</p>
      </div>

    </div>
  )
}
