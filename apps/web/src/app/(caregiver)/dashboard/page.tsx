"use client"

import Link from "next/link"
import { Users, BarChart2, Calendar, Flag, PhoneCall, Heart, Bell } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"

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

  const { data: healthBaseline } = trpc.health.getHealthBaseline.useQuery(
    { elderlyProfileId: elderlyId! },
    { enabled: !!elderlyId }
  )

  const { data: lastHealthCheck } = trpc.health.getLastHealthCheckDetails.useQuery(
    { elderlyProfileId: elderlyId! },
    { enabled: !!elderlyId }
  )

  const { data: wellbeingTrend } = trpc.health.getWellbeingTrend.useQuery(
    { elderlyProfileId: elderlyId!, days: 30 },
    { enabled: !!elderlyId }
  )

  const { data: domainTrends } = (trpc as any).cognitive.getDomainTrends.useQuery(
    { elderlyProfileId: elderlyId!, count: 10 },
    { enabled: !!elderlyId }
  )

  const { data: notifications } = (trpc as any).notifications.getForElderly.useQuery(
    { elderlyProfileId: elderlyId!, limit: 5 },
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
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="text-sm text-warm-500">Latest stability index:</span>
                <span className="text-lg font-display font-medium text-warm-900">
                  {latestStability != null ? latestStability.toFixed(2) : "—"}
                </span>
              </div>
              <div className="flex gap-1 items-end h-20">
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

        {domainTrends && domainTrends.length >= 3 && (
          <SectionCard>
            <SectionHeading>Domain trends</SectionHeading>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={domainTrends.map((d: any, i: number) => {
                const ds = d.domainScores as Record<string, { normalized: number }> | null
                return {
                  session: `S${i + 1}`,
                  orientation: ds?.orientation?.normalized ?? null,
                  attention: ds?.attentionConcentration?.normalized ?? null,
                  workingMemory: ds?.workingMemory?.normalized ?? null,
                  delayedRecall: ds?.delayedRecall?.normalized ?? null,
                  language: ds?.languageVerbalFluency?.normalized ?? null,
                  abstraction: ds?.abstractionReasoning?.normalized ?? null,
                }
              })}>
                <XAxis dataKey="session" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : '—'} />
                <Legend iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="orientation" stroke="#4f9e8f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="attention" stroke="#e07b4a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="workingMemory" stroke="#7b68c8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="delayedRecall" stroke="#d94f5c" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="language" stroke="#4a90d9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="abstraction" stroke="#8ab547" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

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
          <SectionHeading>Health overview</SectionHeading>
          {!healthBaseline && !lastHealthCheck ? (
            <div className="h-32 bg-ivory rounded-xl border-2 border-dashed border-warm-300 flex flex-col items-center justify-center gap-2">
              <Heart size={28} className="text-warm-300" strokeWidth={1.5} />
              <p className="text-sm text-warm-500">Health data will appear after the first check-in call</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {healthBaseline && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Baseline averages</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-ivory rounded-xl p-3">
                      <p className="text-xs text-warm-500 mb-1">Wellbeing</p>
                      <p className="text-lg font-display font-medium text-warm-900">
                        {healthBaseline.avgWellbeing != null ? `${healthBaseline.avgWellbeing.toFixed(1)}/10` : "—"}
                      </p>
                    </div>
                    <div className="bg-ivory rounded-xl p-3">
                      <p className="text-xs text-warm-500 mb-1">Sleep</p>
                      <p className="text-lg font-display font-medium text-warm-900">
                        {healthBaseline.avgSleepQuality != null ? `${healthBaseline.avgSleepQuality.toFixed(1)}/10` : "—"}
                      </p>
                    </div>
                    <div className="bg-ivory rounded-xl p-3">
                      <p className="text-xs text-warm-500 mb-1">Med. adherence</p>
                      <p className="text-lg font-display font-medium text-warm-900">
                        {healthBaseline.medications?.length
                          ? `${Math.round(healthBaseline.medications.filter((m: any) => m.adherenceRate != null).reduce((sum: number, m: any) => sum + (m.adherenceRate ?? 0), 0) / Math.max(healthBaseline.medications.filter((m: any) => m.adherenceRate != null).length, 1))}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {lastHealthCheck && (() => {
                const wb = lastHealthCheck.wellbeingLog as any
                return (
                  <div>
                    <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">
                      Last check-in — {formatDate(lastHealthCheck.createdAt)}
                    </p>
                    <div className="flex gap-4 mb-2">
                      {wb?.overallWellbeing != null && (
                        <span className="text-sm text-warm-700">Wellbeing: <span className="font-medium text-warm-900">{wb.overallWellbeing}/10</span></span>
                      )}
                      {wb?.sleepQuality != null && (
                        <span className="text-sm text-warm-700">Sleep: <span className="font-medium text-warm-900">{wb.sleepQuality}/10</span></span>
                      )}
                    </div>
                    {wb?.concerns?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {wb.concerns.map((c: string, i: number) => (
                          <span key={i} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {wellbeingTrend && wellbeingTrend.length >= 2 && (
                <div>
                  <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Wellbeing trend (30 days)</p>
                  <div className="flex gap-1 items-end h-16">
                    {wellbeingTrend.map((entry: any, i: number) => (
                      <div
                        key={i}
                        className="flex-1 bg-teal/20 rounded-t"
                        style={{ height: `${((entry.overallWellbeing ?? 0) / 10) * 100}%`, minHeight: "4px" }}
                        title={`${formatDate(entry.date)}: ${entry.overallWellbeing ?? "—"}/10`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-display font-medium text-warm-900 text-lg">Active flags</h2>
            {notifications && notifications.length > 0 && (
              <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-medium">
                {notifications.length}
              </span>
            )}
          </div>
          {notifications && notifications.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {notifications.map((n: any) => (
                <div key={n.id} className="flex items-start gap-3 py-3">
                  <Bell size={15} className="text-red-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 truncate">{n.title}</p>
                    <p className="text-xs text-warm-500">{n.body}</p>
                  </div>
                  <span className="text-xs text-warm-400 shrink-0">
                    {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Flag}
              heading="No flags"
              description="nAIber hasn't detected anything requiring attention."
              compact
            />
          )}
        </SectionCard>

      </div>
    </div>
  )
}
