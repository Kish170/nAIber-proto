import type { Metadata } from "next"

export const metadata: Metadata = { title: "Get Started" }

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-8">
      <div className="max-w-sm w-full">
        <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
          Create your account
        </h1>
        <p className="text-warm-500 text-sm">
          Name, email, password or magic link, phone, terms agreement.
        </p>
      </div>
    </div>
  )
}
