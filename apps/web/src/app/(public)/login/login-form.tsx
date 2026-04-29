"use client"

import { type FormEvent, useState } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/common/logo"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

export function LoginForm() {
  const isDemoAuthEnabled = process.env.NEXT_PUBLIC_DEMO_AUTH_ENABLED === "true"
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"
  const error = searchParams.get("error")

  function handleGoogleSignIn() {
    setIsLoading(true)
    signIn("google", { callbackUrl })
  }

  async function handleDemoSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email || !password) {
      setCredentialError("Please enter both email and password.")
      return
    }

    setIsLoading(true)
    setCredentialError(null)

    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    })

    setIsLoading(false)

    if (result?.error) {
      setCredentialError("Invalid demo credentials. Please try again.")
      return
    }

    if (result?.url) {
      window.location.href = result.url
      return
    }

    window.location.href = callbackUrl
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

          {isDemoAuthEnabled && (
            <form onSubmit={handleDemoSignIn} className="space-y-3 mb-4">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading}
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
              />
              {credentialError && (
                <p className="text-xs text-destructive text-center">
                  {credentialError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                variant="outline"
                disabled={isLoading}
              >
                {isLoading ? "Signing in…" : "Sign in with demo account"}
              </Button>
              <Separator />
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
