"use client"

import { useState } from "react"
import { ClipboardList, History, Users } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { useActiveUserStore } from "@/stores/active-user.store"
import { trpc } from "@/lib/trpc"
import {
  OBSERVATION_QUESTIONS,
  CHANGE_LEVEL_LABELS,
  ChangeLevel,
} from "@/types/onboarding"

function SectionCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-card px-6 py-6">
      <h2 className="font-display font-medium text-warm-900 text-base mb-4">{heading}</h2>
      {children}
    </div>
  )
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function ObservationDisplay({ responses }: { responses: Record<string, string> }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {OBSERVATION_QUESTIONS.map(({ key, label }) => {
        const value = responses[key]
        if (!value) return null
        return (
          <div key={key} className="flex items-center justify-between py-3">
            <span className="text-sm text-warm-700 flex-1">{label}</span>
            <span className="text-sm text-warm-900 font-medium ml-4 shrink-0">
              {CHANGE_LEVEL_LABELS[value as ChangeLevel] ?? value}
            </span>
          </div>
        )
      })}
      {responses.otherNotes && (
        <div className="py-3">
          <p className="text-xs text-warm-500 mb-1">Additional notes</p>
          <p className="text-sm text-warm-700">{responses.otherNotes}</p>
        </div>
      )}
    </div>
  )
}

export default function ObservationsPage() {
  const elderlyId = useActiveUserStore((s) => s.selectedElderlyId)
  const [showHistory, setShowHistory] = useState(false)

  const { data: contacts } = trpc.observations.getTrustedContacts.useQuery(
    { elderlyProfileId: elderlyId! },
    { enabled: !!elderlyId }
  )

  const contact = (contacts as any)?.[0]
  const trustedContactId = contact?.id as string | undefined

  const { data: latestSubmission } = trpc.observations.getLatestSubmission.useQuery(
    { trustedContactId: trustedContactId! },
    { enabled: !!trustedContactId }
  )

  const { data: submissionHistory } = trpc.observations.getSubmissionHistory.useQuery(
    { trustedContactId: trustedContactId! },
    { enabled: !!trustedContactId && showHistory }
  )

  if (!elderlyId) {
    return (
      <div className="p-8 min-h-screen bg-ivory">
        <div className="max-w-4xl mx-auto">
          <SectionCard heading="Observations">
            <EmptyState
              icon={Users}
              heading="No one selected"
              description="Select a person from the sidebar to view their observations."
              compact
            />
          </SectionCard>
        </div>
      </div>
    )
  }

  const latest = latestSubmission as any
  const latestResponses = latest?.structuredResponses as Record<string, string> | undefined
  const history = (submissionHistory ?? []) as any[]

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

        <SectionCard heading="Current observations">
          {latestResponses ? (
            <div>
              <p className="text-xs text-warm-500 mb-3">
                Last updated {formatDate(latest.createdAt)}
              </p>
              <ObservationDisplay responses={latestResponses} />
            </div>
          ) : (
            <EmptyState
              icon={ClipboardList}
              heading="No observations yet"
              description="Observations are captured during onboarding. You can update them at any time using the button above."
              compact
            />
          )}
        </SectionCard>

        <SectionCard heading="Submission history">
          {!showHistory ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(true)}
              >
                Load history
              </Button>
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={History}
              heading="No previous submissions"
              description="Each time you update your observations, the previous version is saved here."
              compact
            />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {history.map((sub: any) => (
                <div key={sub.id} className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-warm-900">
                      {formatDate(sub.createdAt)}
                    </span>
                    <span className="text-xs text-warm-500 capitalize">
                      {sub.submissionType.toLowerCase().replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-warm-500">
                    Raw score: {sub.rawScore} · Concern index: {sub.informantConcernIndex?.toFixed(2) ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  )
}
