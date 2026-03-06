import type { Metadata } from "next"

export const metadata: Metadata = { title: "Onboarding" }

export default function OnboardingStepPage({
  params,
}: {
  params: { step: string }
}) {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <p className="text-xs text-teal uppercase tracking-widest font-medium mb-2">
          Step {params.step} of 7
        </p>
        <h1 className="font-display font-medium text-warm-900 text-2xl mb-4">
          Onboarding
        </h1>
        <p className="text-warm-500 text-sm">
          7-step flow: basic profile, preferences, health, cognitive, observations, emergency contact, activation.
        </p>
      </div>
    </div>
  )
}
