"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { EmptyState } from "@/components/common/empty-state"
import { trpc } from "@/lib/trpc"

function SectionCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-card px-6 py-6">
      <h2 className="font-display font-medium text-warm-900 text-base mb-4">{heading}</h2>
      {children}
    </div>
  )
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-warm-500">{label}</span>
      <span className="text-sm text-warm-900 font-medium">{value}</span>
    </div>
  )
}

function formatDate(date: Date | string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(start: Date | string | null, end: Date | string | null) {
  if (!start || !end) return "—"
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.round(ms / 60000)
  return `${mins} min`
}

const DOMAIN_LABELS: Record<string, string> = {
  memory: "Memory",
  language: "Language",
  attention: "Attention",
  executiveFunction: "Executive Function",
  visuospatial: "Visuospatial",
  abstraction: "Abstraction",
}

export default function SessionDetailPage() {
  const params = useParams<{ sessionId: string }>()

  const { data: callData, isLoading } = trpc.session.getCallLogDetail.useQuery(
    { id: params.sessionId },
  )
  const call = callData as any

  const { data: cogSession } = trpc.cognitive.getSessionDetail.useQuery(
    { id: params.sessionId },
    { enabled: call?.callType === "COGNITIVE" }
  )

  const { data: healthSession } = trpc.health.getHealthCheckBySession.useQuery(
    { callLogId: params.sessionId },
    { enabled: call?.callType === "HEALTH_CHECK" }
  )

  if (isLoading) {
    return (
      <div className="p-8 min-h-screen bg-ivory">
        <div className="max-w-4xl mx-auto">
          <div className="h-8 w-48 bg-warm-200 rounded animate-pulse mb-6" />
          <div className="h-64 bg-white rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  if (!call) {
    return (
      <div className="p-8 min-h-screen bg-ivory">
        <div className="max-w-4xl mx-auto">
          <EmptyState
            icon={AlertTriangle}
            heading="Session not found"
            action={{ label: "Back to sessions", href: "/sessions" }}
          />
        </div>
      </div>
    )
  }

  const cogData = cogSession as any
  const domainScores = cogData?.domainScores as Record<string, number> | undefined
  const healthData = healthSession as any

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div className="flex items-center gap-3">
          <Link
            href="/sessions"
            className="w-8 h-8 rounded-lg bg-white border border-border flex items-center justify-center hover:bg-ivory transition-colors"
          >
            <ArrowLeft size={15} className="text-warm-700" />
          </Link>
          <div>
            <p className="text-xs text-warm-500 capitalize">{call.callType.toLowerCase()} call</p>
            <h1 className="font-display font-medium text-warm-900 text-2xl">Session detail</h1>
          </div>
        </div>

        <SectionCard heading="Session info">
          <KVRow label="Status" value={call.status} />
          <KVRow label="Outcome" value={call.outcome ?? "—"} />
          <KVRow label="Scheduled" value={formatDate(call.scheduledTime)} />
          <KVRow label="Duration" value={formatDuration(call.scheduledTime, call.endTime)} />
          <KVRow label="Call type" value={call.callType} />
        </SectionCard>

        {domainScores && (
          <SectionCard heading="Domain performance">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(domainScores).map(([domain, score]) => (
                <div key={domain} className="bg-ivory rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-warm-900 font-medium">
                    {DOMAIN_LABELS[domain] ?? domain}
                  </span>
                  <span className="text-sm text-warm-900 font-medium">
                    {typeof score === "number" ? score.toFixed(1) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {cogData && (
          <SectionCard heading="Stability">
            <KVRow
              label="Stability index"
              value={cogData.stabilityIndex?.toFixed(2) ?? "—"}
            />
            <KVRow label="Partial" value={cogData.isPartial ? "Yes" : "No"} />
            <KVRow
              label="Distress detected"
              value={cogData.distressDetected ? "Yes" : "No"}
            />
          </SectionCard>
        )}

        {call.conversationSummary && (
          <SectionCard heading="Conversation summary">
            <p className="text-sm text-warm-700 leading-relaxed">
              {call.conversationSummary.summaryText}
            </p>
            {call.conversationSummary.topicsDiscussed.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {call.conversationSummary.topicsDiscussed.map((topic: string) => (
                  <span
                    key={topic}
                    className="text-xs px-2.5 py-1 rounded-full bg-teal/10 text-teal font-medium"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {healthData?.wellbeingLog && (
          <SectionCard heading="Wellbeing">
            {healthData.wellbeingLog.overallWellbeing != null && (
              <KVRow label="Overall wellbeing" value={`${healthData.wellbeingLog.overallWellbeing}/10`} />
            )}
            {healthData.wellbeingLog.sleepQuality != null && (
              <KVRow label="Sleep quality" value={`${healthData.wellbeingLog.sleepQuality}/10`} />
            )}
            {healthData.wellbeingLog.physicalSymptoms && (
              <KVRow label="Physical symptoms" value={healthData.wellbeingLog.physicalSymptoms} />
            )}
            {healthData.wellbeingLog.generalNotes && (
              <div className="py-2.5 border-b border-border last:border-0">
                <p className="text-sm text-warm-500 mb-1">Notes</p>
                <p className="text-sm text-warm-900">{healthData.wellbeingLog.generalNotes}</p>
              </div>
            )}
          </SectionCard>
        )}

        {healthData?.medicationLogs?.length > 0 && (
          <SectionCard heading="Medications">
            <div className="flex flex-col divide-y divide-border">
              {healthData.medicationLogs.map((log: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm text-warm-900 font-medium">{log.medication?.name ?? "—"}</p>
                    {log.adherenceContext && (
                      <p className="text-xs text-warm-500 mt-0.5">{log.adherenceContext}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.medicationTaken ? "bg-teal/10 text-teal" : "bg-red-50 text-red-600"}`}>
                    {log.medicationTaken ? "Taken" : "Missed"}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {healthData?.conditionLogs?.length > 0 && (
          <SectionCard heading="Conditions">
            <div className="flex flex-col divide-y divide-border">
              {healthData.conditionLogs.map((log: any, i: number) => (
                <div key={i} className="py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-warm-900 font-medium">{log.condition?.condition ?? "—"}</p>
                    {log.severity && (
                      <span className="text-xs text-warm-500 capitalize">{log.severity.toLowerCase()}</span>
                    )}
                  </div>
                  {log.changeFromBaseline && (
                    <p className="text-xs text-warm-500 mt-0.5 capitalize">{log.changeFromBaseline.toLowerCase().replace(/_/g, " ")}</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {!domainScores && !call.conversationSummary && !healthData && (
          <SectionCard heading="Details">
            <EmptyState
              icon={AlertTriangle}
              heading="No additional data"
              description="Detailed results will appear here once the call is completed and processed."
              compact
            />
          </SectionCard>
        )}

      </div>
    </div>
  )
}
