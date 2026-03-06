import type { Metadata } from "next"

export const metadata: Metadata = { title: "Check Your Email" }

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
          Check your email.
        </h1>
        <p className="text-warm-500 text-sm">
          Email verification required before accessing the dashboard.
        </p>
      </div>
    </div>
  )
}
