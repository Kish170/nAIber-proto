import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sign In" }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-8">
      <div className="max-w-sm w-full">
        <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
          Sign in
        </h1>
        <p className="text-warm-500 text-sm">Caregiver login form.</p>
      </div>
    </div>
  )
}
