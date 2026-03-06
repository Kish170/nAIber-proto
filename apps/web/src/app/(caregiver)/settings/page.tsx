import type { Metadata } from "next"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
        Settings
      </h1>
      <p className="text-warm-500 text-sm">
        Account settings, notification preferences, caregiver account management.
      </p>
    </div>
  )
}
