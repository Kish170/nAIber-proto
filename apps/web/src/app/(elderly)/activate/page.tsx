import type { Metadata } from "next"
import Link from "next/link"

import { Logo } from "@/components/common/logo"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Welcome to nAIber" }

export default function ActivatePage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-6">
      <div className="bg-white rounded-2xl shadow-elevated px-8 py-10 max-w-md w-full">

        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <h1 className="font-display font-medium text-warm-900 text-2xl leading-snug mb-3">
          Hi Dorothy, nAIber is here for you.
        </h1>
        <p className="text-warm-500 leading-relaxed mb-8">
          Your caregiver has set up regular friendly calls for you. nAIber will check in, have a chat,
          and let them know you're doing well. There's nothing complicated — just pick up when we call.
        </p>

        <Button asChild className="w-full bg-teal text-ivory hover:bg-teal-light text-base py-6 mb-4">
          <Link href="/welcome/1">That sounds good</Link>
        </Button>

        <div className="text-center">
          <Link href="#" className="text-sm text-warm-500 hover:underline transition-colors">
            I'd like to opt out
          </Link>
        </div>

      </div>
    </div>
  )
}
