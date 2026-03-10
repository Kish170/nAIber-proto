"use client"

import Link from "next/link"
import { Plus, Check } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { useActiveUserStore } from "@/stores/active-user.store"
import { useEffect } from "react"

export function UserSwitcher() {
  const { data: profile, isLoading } = trpc.caregiver.getProfile.useQuery()
  const { data: managedUsers } = trpc.caregiver.getManagedUsers.useQuery()

  const { caregiver, selectedElderlyId, setCaregiver, selectElderly } = useActiveUserStore()

  useEffect(() => {
    if (profile && managedUsers) {
      setCaregiver({
        caregiverProfileId: profile.id,
        name: profile.name,
        managedUsers: managedUsers.map((u) => ({
          elderlyProfileId: u.id,
          name: u.name,
          phone: u.phone,
          lastCallAt: u.lastCallAt ? String(u.lastCallAt) : null,
        })),
      })
    }
  }, [profile, managedUsers, setCaregiver])

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[10px] text-warm-500 uppercase tracking-widest font-medium mb-2 px-1">
          My people
        </p>
        <div className="bg-ivory rounded-xl p-3">
          <div className="h-4 w-24 bg-warm-200 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  const users = caregiver?.managedUsers ?? []

  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-[10px] text-warm-500 uppercase tracking-widest font-medium mb-2 px-1">
        My people
      </p>

      <div className="bg-ivory rounded-xl p-3 flex flex-col gap-2">
        {users.length === 0 ? (
          <p className="text-xs text-warm-500 leading-snug">
            No one added yet.
          </p>
        ) : (
          users.map((user) => (
            <button
              key={user.elderlyProfileId}
              onClick={() => selectElderly(user.elderlyProfileId)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                selectedElderlyId === user.elderlyProfileId
                  ? "bg-teal/10"
                  : "hover:bg-white"
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-teal flex items-center justify-center shrink-0">
                <span className="text-[10px] text-ivory font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-xs text-warm-700 font-medium flex-1 truncate">
                {user.name}
              </span>
              {selectedElderlyId === user.elderlyProfileId && (
                <Check size={12} className="text-teal shrink-0" />
              )}
            </button>
          ))
        )}
        <Link
          href="/onboarding/0"
          className="inline-flex items-center gap-1 text-xs text-teal font-medium hover:text-teal-light transition-colors"
        >
          <Plus size={12} />
          Add a person
        </Link>
      </div>
    </div>
  )
}
