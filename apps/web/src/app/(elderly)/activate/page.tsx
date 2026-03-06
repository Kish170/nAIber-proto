import type { Metadata } from "next"

export const metadata: Metadata = { title: "Welcome to nAIber" }

export default function ActivatePage() {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <h1 className="font-display font-medium text-warm-900 text-3xl mb-4">
          Welcome to nAIber.
        </h1>
        <p className="text-warm-700 leading-relaxed mb-8">
          Activation confirmation and preferences — magic link entry point.
        </p>
      </div>
    </div>
  )
}
