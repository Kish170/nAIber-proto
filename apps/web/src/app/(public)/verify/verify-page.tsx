"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/common/logo"

export function VerifyPage() {
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleResend() {
    setResending(true)
    await new Promise((r) => setTimeout(r, 800))
    setResending(false)
    setResent(true)
  }

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">

        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "#5B8C8A1A" }}
        >
          <Mail size={24} className="text-teal" strokeWidth={1.8} />
        </div>

        <h1 className="font-display font-medium text-warm-900 text-[1.6rem] leading-snug mb-3">
          Check your email.
        </h1>
        <p className="text-sm text-warm-700 leading-relaxed mb-8">
          We sent a verification link to your email address. Click it to
          activate your account and get started.
        </p>

        {resent ? (
          <p className="text-sm text-teal font-medium mb-6">
            Verification email resent.
          </p>
        ) : (
          <Button
            variant="outline"
            className="w-full mb-4"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? "Sending…" : "Resend verification email"}
          </Button>
        )}

        <p className="text-sm text-warm-500">
          Wrong email?{" "}
          <Link href="/signup" className="text-teal font-medium hover:underline">
            Go back
          </Link>
          {" · "}
          <Link href="/login" className="text-teal font-medium hover:underline">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}