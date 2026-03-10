"use client"

import Link from "next/link"
import { Users, BarChart2, Calendar, Flag, PhoneCall } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Badge } from "@/components/ui/badge"
import { useActiveUserStore } from "@/stores/active-user.store"
import { trpc } from "@/lib/trpc"

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-card px-6 py-6 ${className ?? ""}`}>
      {children}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-medium text-warm-900 text-lg mb-4">{children}</h2>
  )
}

function formatDate(date: Date | string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function DashboardPage() {
  const selectedElderly = useActiveUserStore((s) => s.getSelectedElderly())
  const elderlyId = selectedElderly?.elderlyProfileId

  const { data: profile } = trpc.user.getById.useQuery(
    { id: elderlyId! },
    { enabled: !!elderlyId }
  )

  const { data: callStats } = trpc.session.getCallStats.useQuery(
    { elderlyProfileId: elderlyId! },
    { enabled: !!elderlyId }
  )

  const { data: recentCalls } = trpc.session.getCallLogs.useQuery(
    { elderlyProfileId: elderlyId!, limit: 5 },
    { enabled: !!elderlyId }
  )

  const { data: cogTrends } = trpc.cognitive.getTrends.useQuery(
    { elderlyProfileId: elderlyId!, count: 10 },
    { enabled: !!elderlyId }
  )

  if (!elderlyId) {
    return (
      <div className="p-8 min-h-screen bg-ivory">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Dashboard</h1>
            <p className="text-sm text-warm-500">Overview of check-in activity and wellness trends.</p>
          </div>
          <SectionCard>
            <EmptyState
              icon={Users}
              heading="No one added yet"
              description="Add the person you're caring for to see their check-in activity, stability trends, and session history."
              action={{ label: "Add a person", href: "/onboarding/0" }}
            />
          </SectionCard>
        </div>
      </div>
    )
  }

  const latestStability = cogTrends?.[0]?.stabilityIndex

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Dashboard</h1>
          <p className="text-sm text-warm-500">
            Overview for {selectedElderly.name}.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <SectionCard>
            <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Status</p>
            <Badge variant="outline">
              {profile?.activationStatus === "ACTIVE" ? "Active" : "Awaiting activation"}
            </Badge>
          </SectionCard>
          <SectionCard>
            <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Last check-in</p>
            {selectedElderly.lastCallAt ? (
              <p className="text-sm text-warm-900 font-medium">{formatDate(selectedElderly.lastCallAt)}</p>
            ) : (
              <EmptyState icon={Calendar} heading="No check-ins yet" compact />
            )}
          </SectionCard>
          <SectionCard>
            <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Total calls</p>
            <p className="text-2xl font-display font-medium text-warm-900">
              {callStats?.total ?? 0}
            </p>
            {callStats && callStats.completed > 0 && (
              <p className="text-xs text-warm-500 mt-1">
                {callStats.completed} completed
              </p>
            )}
          </SectionCard>
        </div>

        <SectionCard>
          <SectionHeading>Stability overview</SectionHeading>
          {cogTrends && cogTrends.length >= 3 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-warm-500">Latest stability index:</span>
                <span className="text-lg font-display font-medium text-warm-900">
                  {latestStability != null ? latestStability.toFixed(2) : "—"}
                </span>
              </div>
              <div className="flex gap-1 items-end h-32">
                {cogTrends.map((result: any, i: number) => (
                  <div
                    key={result.id}
                    className="flex-1 bg-teal/20 rounded-t"
                    style={{
                      height: `${((result.stabilityIndex ?? 0) / 1) * 100}%`,
                      minHeight: "4px",
                    }}
                    title={`Session ${i + 1}: ${result.stabilityIndex?.toFixed(2) ?? "—"}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 bg-ivory rounded-xl border-2 border-dashed border-warm-300 flex flex-col items-center justify-center gap-2">
              <BarChart2 size={32} className="text-warm-300" strokeWidth={1.5} />
              <p className="text-sm text-warm-500">Stability data will appear after 3 sessions</p>
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <SectionHeading>Recent sessions</SectionHeading>
            <Link href="/sessions" className="text-xs text-teal hover:text-teal-light font-medium">
              View all
            </Link>
          </div>
          {recentCalls && recentCalls.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {recentCalls.map((call: any) => (
                <div key={call.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <PhoneCall size={15} className="text-warm-300" />
                    <div>
                      <p className="text-sm text-warm-900 font-medium capitalize">{call.callType.toLowerCase()}</p>
                      <p className="text-xs text-warm-500">{formatDate(call.scheduledTime)}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {call.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              heading="No sessions recorded yet"
              description="Sessions will appear here after nAIber begins calling."
              compact
            />
          )}
        </SectionCard>

        <SectionCard>
          <SectionHeading>Active flags</SectionHeading>
          <EmptyState
            icon={Flag}
            heading="No flags"
            description="nAIber hasn't detected anything requiring attention."
            compact
          />
        </SectionCard>

      </div>
    </div>
  )
}
