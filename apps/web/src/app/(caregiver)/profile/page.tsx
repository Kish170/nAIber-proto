"use client"

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import { User, Phone, Mail, Globe, Calendar, Clock, Heart, UserCheck, PhoneCall } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InviteCaregiverDialog } from "@/components/caregiver/profile/invite-caregiver-dialog"
import { useActiveUserStore } from "@/stores/active-user.store"
import { trpc } from "@/lib/trpc"
import { FREQUENCY_OPTIONS, type MedicationSchedule } from "@/types/onboarding"

function formatFrequency(value: unknown): string {
  if (value == null) return "—"
  if (typeof value === "string") return value
  if (typeof value !== "object") return "—"
  const schedule = value as MedicationSchedule
  const match = FREQUENCY_OPTIONS.find((option) => {
    const a = option.schedule
    return (
      a.timesPerDay === schedule.timesPerDay &&
      a.perWeek === schedule.perWeek &&
      a.intervalDays === schedule.intervalDays &&
      a.prn === schedule.prn
    )
  })
  if (match) return match.label
  if (schedule.timesPerDay) return `${schedule.timesPerDay}× daily`
  if (schedule.perWeek) return `${schedule.perWeek}× per week`
  if (schedule.intervalDays) return `Every ${schedule.intervalDays} days`
  if (schedule.prn) return "As needed"
  return "—"
}

function SectionCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-card px-6 py-6">
      <h2 className="font-display font-medium text-warm-900 text-base mb-5">{heading}</h2>
      {children}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <Icon size={15} className="text-warm-300 mt-0.5 shrink-0" />
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm text-warm-500">{label}</span>
        <span className="text-sm text-warm-900 font-medium">{value || "—"}</span>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [callState, setCallState] = useState<{ type: string; status: 'idle' | 'calling' | 'success' | 'error' }>({ type: '', status: 'idle' })
  const elderlyId = useActiveUserStore((s) => s.selectedElderlyId)

  async function initiateCall(type: 'general' | 'health' | 'cognitive') {
    const pathMap = { general: '/call', health: '/call/health-check', cognitive: '/call/cognitive' }
    const telephonyUrl = process.env.NEXT_PUBLIC_TELEPHONY_URL ?? 'http://localhost:3000'
    setCallState({ type, status: 'calling' })
    try {
      const res = await fetch(`${telephonyUrl}${pathMap[type]}`, { method: 'POST' })
      if (res.ok) {
        setCallState({ type, status: 'success' })
        setTimeout(() => setCallState({ type: '', status: 'idle' }), 4000)
      } else {
        setCallState({ type, status: 'error' })
        setTimeout(() => setCallState({ type: '', status: 'idle' }), 4000)
      }
    } catch {
      setCallState({ type, status: 'error' })
      setTimeout(() => setCallState({ type: '', status: 'idle' }), 4000)
    }
  }

  const { data: profile, isLoading } = trpc.user.getById.useQuery(
    { id: elderlyId! },
    { enabled: !!elderlyId }
  )

  if (!elderlyId) {
    return (
      <div className="p-8 min-h-screen bg-ivory">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-6">Profile</h1>
          <div className="bg-white rounded-2xl shadow-card">
            <EmptyState
              icon={User}
              heading="No profile yet"
              description="Complete onboarding to see the profile for your loved one."
              action={{ label: "Begin onboarding", href: "/onboarding/0" }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (isLoading || !profile) {
    return (
      <div className="p-8 min-h-screen bg-ivory">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-6">Profile</h1>
          <div className="h-64 bg-white rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  const initial = profile.name.charAt(0).toUpperCase()
  const interests = profile.interests.length > 0 ? profile.interests.join(", ") : null
  const medications = profile.medications as Array<{
    id: string
    name: string
    dosage: string
    frequency: unknown
  }>

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <h1 className="font-display font-medium text-warm-900 text-2xl">Profile</h1>

        <SectionCard heading="">
          <div className="flex items-start gap-5 mb-6">
            <div className="w-16 h-16 rounded-full bg-teal flex items-center justify-center shrink-0">
              <span className="text-xl text-ivory font-display font-medium">{initial}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-display font-medium text-warm-900 text-xl">{profile.name}</h2>
                <Badge variant="outline">
                  {profile.activationStatus === "ACTIVE" ? "Active" : "Awaiting activation"}
                </Badge>
              </div>
              {profile.age && <p className="text-sm text-warm-500">{profile.age} years old</p>}
            </div>
          </div>

          <InfoRow icon={Phone} label="Phone" value={profile.phone} />
          <InfoRow icon={Mail} label="Email" value={profile.email ?? "—"} />
          <InfoRow icon={Globe} label="Gender" value={profile.gender ?? "—"} />
        </SectionCard>

        <SectionCard heading="Preferences">
          <InfoRow icon={Clock} label="Call frequency" value={profile.callFrequency} />
          <div className="py-2.5 border-b border-border">
            <div className="flex items-center gap-3 mb-2">
              <Heart size={15} className="text-warm-300 shrink-0" />
              <span className="text-sm text-warm-500">Interests</span>
            </div>
            {interests ? (
              <div className="flex flex-wrap gap-2 pl-6">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="text-xs px-2.5 py-1 rounded-full bg-teal/10 text-teal font-medium"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-warm-300 pl-6">No interests added</p>
            )}
          </div>
        </SectionCard>

        {profile.healthConditions.length > 0 && (
          <SectionCard heading="Health conditions">
            <div className="flex flex-col divide-y divide-border">
              {profile.healthConditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-warm-900">{c.condition}</span>
                  {c.severity && (
                    <span className="text-xs text-warm-500">{c.severity}</span>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {medications.length > 0 && (
          <SectionCard heading="Medications">
            <div className="flex flex-col divide-y divide-border">
              {medications.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="text-sm text-warm-900 font-medium">{m.name}</span>
                    <span className="text-xs text-warm-500 ml-2">{m.dosage}</span>
                  </div>
                  <span className="text-xs text-warm-500">{formatFrequency(m.frequency)}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {profile.emergencyContact && (
          <SectionCard heading="Emergency contact">
            <InfoRow icon={User} label="Name" value={profile.emergencyContact.name} />
            <InfoRow icon={Phone} label="Phone" value={profile.emergencyContact.phone} />
            <InfoRow icon={Mail} label="Email" value={profile.emergencyContact.email ?? "—"} />
            <InfoRow icon={UserCheck} label="Relationship" value={profile.emergencyContact.relationship} />
          </SectionCard>
        )}

        <SectionCard heading="Caregivers">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-warm-500">People with access to this profile.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInviteOpen(true)}
            >
              Invite another caregiver
            </Button>
          </div>
        </SectionCard>

        <SectionCard heading="Initiate call">
          <p className="text-sm text-warm-500 mb-4">
            Manually trigger a call to {profile.name}. The call will use the registered phone number.
          </p>
          <div className="flex gap-3 flex-wrap">
            {(['general', 'health', 'cognitive'] as const).map((type) => {
              const labels = { general: 'General call', health: 'Health check', cognitive: 'Cognitive assessment' }
              const isActive = callState.type === type && callState.status === 'calling'
              return (
                <Button
                  key={type}
                  variant="outline"
                  disabled={callState.status === 'calling'}
                  onClick={() => initiateCall(type)}
                  className="flex items-center gap-2"
                >
                  <PhoneCall size={14} />
                  {isActive ? 'Calling…' : labels[type]}
                </Button>
              )
            })}
          </div>
          {callState.status === 'success' && (
            <p className="text-sm text-teal mt-3">Call initiated successfully.</p>
          )}
          {callState.status === 'error' && (
            <p className="text-sm text-red-500 mt-3">Failed to initiate call. Check that the telephony server is running.</p>
          )}
        </SectionCard>

      </div>

      <InviteCaregiverDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
