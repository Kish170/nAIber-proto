"use client"

import { PhoneCall } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { trpc } from "@/lib/trpc"

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function ElderlyHomePage() {
  const { data: profile } = trpc.user.getOwnProfile.useQuery()
  const user = profile as any
  const firstName = user?.name?.split(" ")[0] ?? "there"

  const lastCallAt = user?.lastCallAt

  return (
    <div className="p-6 flex flex-col gap-5">

      <div className="pt-2">
        <h1 className="font-display font-medium text-warm-900 text-3xl leading-snug mb-1">
          Hello, {firstName}.
        </h1>
        <p className="text-warm-500">Welcome to nAIber.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-card px-6 py-6">
        <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-3">Your last chat</p>
        {lastCallAt ? (
          <div className="flex items-center gap-3">
            <PhoneCall size={15} className="text-teal" />
            <p className="text-sm text-warm-900 font-medium">{formatDate(lastCallAt)}</p>
          </div>
        ) : (
          <EmptyState
            icon={PhoneCall}
            heading="No calls yet"
            description="nAIber will reach out soon."
            compact
          />
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="border-l-4 border-teal px-6 py-6">
          <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Your next call</p>
          {user?.preferredCallTime ? (
            <p className="text-warm-700 leading-relaxed">
              Your preferred time is <span className="font-medium">{user.preferredCallTime.toLowerCase()}</span>.
              We'll call you then.
            </p>
          ) : (
            <p className="text-warm-700 leading-relaxed">
              We'll be in touch once your account is ready.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-card px-6 py-6">
        <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">This month</p>
        {user?.activationStatus === "ACTIVE" ? (
          <p className="text-warm-500 text-sm">
            You're all set. nAIber will keep checking in with you.
          </p>
        ) : (
          <p className="text-warm-500 text-sm">Getting started — calls will begin soon.</p>
        )}
      </div>

    </div>
  )
}
