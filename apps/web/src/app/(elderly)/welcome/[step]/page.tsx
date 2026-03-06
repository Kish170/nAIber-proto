import type { Metadata } from "next"

export const metadata: Metadata = { title: "Getting Started" }

export default function WelcomeStepPage({
  params,
}: {
  params: { step: string }
}) {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <h1 className="font-display font-medium text-warm-900 text-3xl mb-4">
          {params.step === "1" ? "That sounds good." : "A little about you."}
        </h1>
        <p className="text-warm-700 leading-relaxed">
          {params.step === "1"
            ? "Confirmation step — plain language explanation of what nAIber will do."
            : "Optional preferences — pre-filled interests, dislikes, preferred name."}
        </p>
      </div>
    </div>
  )
}
