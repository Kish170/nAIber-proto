import type { Metadata } from "next"

export const metadata: Metadata = { title: "Profile" }

export default function ProfilePage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
        Profile
      </h1>
      <p className="text-warm-500 text-sm">
        Elderly user profile, activation status, manage caregivers, invite second caregiver.
      </p>
    </div>
  )
}
