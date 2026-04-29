"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/common/logo"

const demoEnabled = process.env.NEXT_PUBLIC_DEMO_AUTH_ENABLED === 'true'

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [demoEmail, setDemoEmail] = useState("")
  const [demoPassword, setDemoPassword] = useState("")
  const [demoError, setDemoError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"
  const error = searchParams.get("error")

  function handleGoogleSignIn() {
    setIsLoading(true)
    signIn("google", { callbackUrl })
  }

  async function handleDemoSignIn(e: React.FormEvent) {
    e.preventDefault()
    setDemoError(null)
    setIsLoading(true)
    const result = await signIn("credentials", {
      email: demoEmail,
      password: demoPassword,
      redirect: false,
    })
    if (result?.error) {
      setDemoError("Invalid email or password.")
      setIsLoading(false)
    } else {
      window.location.href = callbackUrl
    }
  }

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="bg-white rounded-2xl shadow-elevated px-8 py-10">
          <h1 className="font-display font-medium text-warm-900 text-[1.6rem] leading-snug mb-1">
            Welcome back.
          </h1>
          <p className="text-sm text-warm-500 mb-8">
            Sign in to your nAIber account.
          </p>

          {error && (
            <p className="text-xs text-destructive text-center mb-4">
              {error === "OAuthAccountNotLinked"
                ? "This email is already associated with another sign-in method."
                : "Something went wrong. Please try again."}
            </p>
          )}

          {demoEnabled && (
            <form onSubmit={handleDemoSignIn} className="mb-4 space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
                className="w-full border border-warm-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
                disabled={isLoading}
              />
              <input
                type="password"
                placeholder="Password"
                value={demoPassword}
                onChange={(e) => setDemoPassword(e.target.value)}
                className="w-full border border-warm-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                required
                disabled={isLoading}
              />
              {demoError && (
                <p className="text-xs text-destructive">{demoError}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-teal text-ivory hover:bg-teal-light"
                disabled={isLoading}
              >
                {isLoading ? "Signing in…" : "Sign in with demo account"}
              </Button>
            </form>
          )}

          <Button
            onClick={handleGoogleSignIn}
            className="w-full bg-teal text-ivory hover:bg-teal-light"
            disabled={isLoading}
          >
            {isLoading ? "Redirecting…" : "Continue with Google"}
          </Button>
        </div>

      </div>
    </div>
  )
}
