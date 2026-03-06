"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

export function WelcomeStep1() {
  const router = useRouter()

  return (
    <div className="p-6 flex flex-col gap-6">

      <div className="pt-2">
        <h1 className="font-display font-medium text-warm-900 text-3xl leading-snug mb-3">
          That sounds good.
        </h1>
        <p className="text-warm-700 leading-relaxed">
          Your caregiver will be able to see how you're doing over time.
          nAIber will call you for a friendly chat and occasional short memory exercises.
          You can stop at any time — just let your caregiver know.
        </p>
      </div>

      <div className="bg-teal/5 border border-teal/20 rounded-2xl px-5 py-5">
        <p className="text-sm text-warm-700 font-medium mb-2">What to expect</p>
        <ul className="flex flex-col gap-2">
          {[
            "A friendly call at a time that works for you",
            "A short conversation — nothing complicated",
            "Occasional gentle exercises to keep your mind active",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-warm-700">
              <span className="w-1.5 h-1.5 rounded-full bg-teal mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Button
        className="w-full bg-teal text-ivory hover:bg-teal-light text-base py-6"
        onClick={() => router.push("/welcome/2")}
      >
        Let's get started
      </Button>

      <div className="text-center">
        <Link href="#" className="text-sm text-warm-500 hover:underline">
          I'd still like to opt out
        </Link>
      </div>

    </div>
  )
}
