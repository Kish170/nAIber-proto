"use client"

import { useState } from "react"
import Link from "next/link"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/common/logo"

export function SignupForm() {
  const [isLoading, setIsLoading] = useState(false)

  function handleGoogleSignIn() {
    setIsLoading(true)
    signIn("google", { callbackUrl: "/onboarding/0" })
  }

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div className="bg-white rounded-2xl shadow-elevated px-8 py-10">
          <h1 className="font-display font-medium text-warm-900 text-[1.6rem] leading-snug mb-1">
            Create your account.
          </h1>
          <p className="text-sm text-warm-500 mb-8">
            Set up nAIber for someone you care for.
          </p>

          <Button
            onClick={handleGoogleSignIn}
            className="w-full bg-teal text-ivory hover:bg-teal-light"
            disabled={isLoading}
          >
            {isLoading ? "Redirecting…" : "Continue with Google"}
          </Button>

          <p className="text-xs text-warm-400 text-center mt-4">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="text-teal hover:underline">Terms</Link>
            {" "}and{" "}
            <Link href="/privacy" className="text-teal hover:underline">Privacy Policy</Link>.
          </p>
        </div>

        <p className="text-center text-sm text-warm-500 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-teal font-medium hover:underline">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}