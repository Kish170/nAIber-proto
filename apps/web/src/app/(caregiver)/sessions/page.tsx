"use client"

import Link from "next/link"
import { PhoneCall } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Badge } from "@/components/ui/badge"
import { useActiveUserStore } from "@/stores/active-user.store"
import { trpc } from "@/lib/trpc"

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "text-green-700 bg-green-50 border-green-200",
  FAILED: "text-red-700 bg-red-50 border-red-200",
  PENDING: "text-amber-700 bg-amber-50 border-amber-200",
  IN_PROGRESS: "text-blue-700 bg-blue-50 border-blue-200",
}

export default function SessionsPage() {
  const elderlyId = useActiveUserStore((s) => s.selectedElderlyId)

  const { data: calls, isLoading } = trpc.session.getCallLogs.useQuery(
    { elderlyProfileId: elderlyId!, limit: 50 },
    { enabled: !!elderlyId }
  )

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Sessions</h1>
          <p className="text-sm text-warm-500">A record of every call nAIber has made.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card">
          {isLoading ? (
            <div className="p-6 flex flex-col gap-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-ivory rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !calls || calls.length === 0 ? (
            <EmptyState
              icon={PhoneCall}
              heading="No sessions yet"
              description="Completed calls will appear here. nAIber will begin calling after activation is confirmed."
              action={{ label: "Go to dashboard", href: "/dashboard" }}
            />
          ) : (
            <div className="divide-y divide-border">
              {calls.map((call: any) => (
                <Link
                  key={call.id}
                  href={`/sessions/${call.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-ivory/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <PhoneCall size={15} className="text-warm-300" />
                    <div>
                      <p className="text-sm text-warm-900 font-medium capitalize">
                        {call.callType.toLowerCase()} call
                      </p>
                      <p className="text-xs text-warm-500">{formatDate(call.scheduledTime)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {call.outcome && (
                      <span className="text-xs text-warm-500 capitalize">
                        {call.outcome.toLowerCase().replace(/_/g, " ")}
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[call.status] ?? ""}
                    >
                      {call.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
