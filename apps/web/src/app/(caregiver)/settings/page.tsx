"use client"

import { useState } from "react"
import { useSession, signOut } from "next-auth/react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

function SectionCard({ heading, description, children }: {
  heading: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-card px-6 py-6 flex flex-col gap-5">
      <div>
        <h2 className="font-display font-medium text-warm-900 text-base">{heading}</h2>
        {description && <p className="text-sm text-warm-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

const NOTIFICATION_ITEMS = [
  { id: "session", label: "Session completed", description: "nAIber will notify you after each call" },
  { id: "missed", label: "Missed call", description: "Alert if a scheduled call is not answered" },
  { id: "flag", label: "Flag detected", description: "Notify when nAIber flags something unusual" },
  { id: "activation", label: "Activation confirmed", description: "When your loved one confirms nAIber" },
  { id: "summary", label: "Weekly summary", description: "Receive a weekly digest of activity" },
]

export default function SettingsPage() {
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<Record<string, boolean>>({
    session: true,
    missed: true,
    flag: true,
    activation: true,
    summary: false,
  })

  function toggleNotification(id: string) {
    setNotifications((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Settings</h1>
          <p className="text-sm text-warm-500">Manage your account and notification preferences.</p>
        </div>

        <SectionCard heading="Account">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-name">Full name</Label>
              <Input id="settings-name" value={session?.user?.name ?? ""} disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-email">Email</Label>
              <Input id="settings-email" type="email" value={session?.user?.email ?? ""} disabled />
            </div>
            <p className="text-xs text-warm-500">Account managed via Google. To update your name or email, update your Google account.</p>
          </div>
        </SectionCard>

        <SectionCard
          heading="Notifications"
          description="Choose when nAIber gets in touch with you."
        >
          <div className="flex flex-col divide-y divide-border">
            {NOTIFICATION_ITEMS.map(({ id, label, description }) => (
              <div key={id} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-medium text-warm-900">{label}</p>
                  <p className="text-xs text-warm-500 mt-0.5">{description}</p>
                </div>
                <Switch
                  checked={notifications[id]}
                  onCheckedChange={() => toggleNotification(id)}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard heading="Session">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-warm-900">Sign out</p>
              <p className="text-xs text-warm-500 mt-0.5">Sign out of your nAIber account on this device.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </SectionCard>

        <div className="border border-destructive/30 bg-destructive/5 rounded-2xl px-6 py-6">
          <h2 className="font-display font-medium text-warm-900 text-base mb-1">Danger zone</h2>
          <p className="text-sm text-warm-500 mb-5">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">
            Delete account
          </Button>
        </div>

      </div>
    </div>
  )
}
