"use client"

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import { User, Phone, Mail, Globe, Calendar, Clock, Heart, UserCheck } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InviteCaregiverDialog } from "@/components/caregiver/profile/invite-caregiver-dialog"

const hasUser = false // no backend yet

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

  if (!hasUser) {
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

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <h1 className="font-display font-medium text-warm-900 text-2xl">Profile</h1>

        <SectionCard heading="">
          <div className="flex items-start gap-5 mb-6">
            <div className="w-16 h-16 rounded-full bg-teal flex items-center justify-center shrink-0">
              <span className="text-xl text-ivory font-display font-medium">M</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-display font-medium text-warm-900 text-xl">Margaret Thompson</h2>
                <Badge variant="outline">Awaiting activation</Badge>
              </div>
              <p className="text-sm text-warm-500">Added 3 days ago</p>
            </div>
            <Button variant="outline" size="sm">Edit profile</Button>
          </div>

          <InfoRow icon={Calendar} label="Date of birth" value="—" />
          <InfoRow icon={Phone} label="Phone" value="—" />
          <InfoRow icon={Mail} label="Email" value="—" />
          <InfoRow icon={Globe} label="Language" value="—" />
        </SectionCard>

        <SectionCard heading="Preferences">
          <InfoRow icon={Clock} label="Preferred call time" value="—" />
          <InfoRow icon={Phone} label="Call frequency" value="—" />
          <div className="py-2.5 border-b border-border">
            <div className="flex items-center gap-3 mb-2">
              <Heart size={15} className="text-warm-300 shrink-0" />
              <span className="text-sm text-warm-500">Interests</span>
            </div>
            <p className="text-sm text-warm-300 pl-6">No interests added</p>
          </div>
        </SectionCard>

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

          <div className="flex items-center gap-3 bg-ivory rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-teal flex items-center justify-center shrink-0">
              <span className="text-xs text-ivory font-medium">C</span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-warm-900 font-medium">You</p>
              <p className="text-xs text-warm-500">Primary caregiver</p>
            </div>
            <div className="flex items-center gap-1.5">
              <UserCheck size={13} className="text-teal" />
              <span className="text-xs text-teal font-medium">Active</span>
            </div>
          </div>
        </SectionCard>

      </div>

      <InviteCaregiverDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
