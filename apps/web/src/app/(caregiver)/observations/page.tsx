"use client"

import { useState } from "react"
import { ClipboardList, History, Users } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActiveUserStore } from "@/stores/active-user.store"
import { trpc } from "@/lib/trpc"
import {
  OBSERVATION_QUESTIONS,
  CHANGE_LEVEL_LABELS,
  ChangeLevel,
} from "@/types/onboarding"

const CHANGE_LEVEL_SCORES: Record<ChangeLevel, number> = {
  [ChangeLevel.NO_CHANGE]: 0,
  [ChangeLevel.SLIGHT]: 1,
  [ChangeLevel.NOTICEABLE]: 2,
  [ChangeLevel.BIG]: 3,
}

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

type QuestionAnswers = Partial<Record<string, ChangeLevel>>

export default function ObservationsPage() {
  const elderlyId = useActiveUserStore((s) => s.selectedElderlyId)
  const [showHistory, setShowHistory] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [answers, setAnswers] = useState<QuestionAnswers>({})

  const utils = trpc.useUtils()

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

  const createSubmission = trpc.observations.createSubmission.useMutation({
    onSuccess: () => {
      setShowForm(false)
      setAnswers({})
      if (trustedContactId) {
        void utils.observations.getLatestSubmission.invalidate({ trustedContactId })
        void utils.observations.getSubmissionHistory.invalidate({ trustedContactId })
      }
    },
  })

  function handleOpenForm() {
    const latest = latestSubmission as any
    const existing = latest?.structuredResponses as Record<string, string> | undefined
    if (existing) {
      const prefilled: QuestionAnswers = {}
      for (const { key } of OBSERVATION_QUESTIONS) {
        if (existing[key]) prefilled[key] = existing[key] as ChangeLevel
      }
      setAnswers(prefilled)
    } else {
      setAnswers({})
    }
    setShowForm(true)
  }

  function handleSubmit() {
    if (!trustedContactId) return

    const scores = OBSERVATION_QUESTIONS.map(({ key }) => {
      const val = answers[key]
      return val != null ? CHANGE_LEVEL_SCORES[val] : 0
    })
    const rawScore = scores.reduce((a, b) => a + b, 0)
    const informantConcernIndex = rawScore / (OBSERVATION_QUESTIONS.length * 3)

    createSubmission.mutate({
      trustedContactId,
      submissionType: "MANUAL",
      structuredResponses: answers,
      rawScore,
      informantConcernIndex,
    })
  }

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
          <Button
            className="bg-teal text-ivory hover:bg-teal-light shrink-0"
            onClick={handleOpenForm}
            disabled={!trustedContactId}
          >
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

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update observations</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 py-2">
            {OBSERVATION_QUESTIONS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <p className="text-sm text-warm-700">{label}</p>
                <Select
                  value={answers[key] ?? ""}
                  onValueChange={(val) =>
                    setAnswers((prev) => ({ ...prev, [key]: val as ChangeLevel }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select change level" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANGE_LEVEL_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {createSubmission.error && (
            <p className="text-xs text-destructive">{createSubmission.error.message}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={createSubmission.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-teal text-ivory hover:bg-teal-light"
              onClick={handleSubmit}
              disabled={createSubmission.isPending || !trustedContactId}
            >
              {createSubmission.isPending ? "Saving…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
