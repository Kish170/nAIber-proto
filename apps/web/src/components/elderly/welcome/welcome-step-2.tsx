"use client"

import { useRouter } from "next/navigation"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

export function WelcomeStep2() {
  const router = useRouter()

  return (
    <div className="p-6 flex flex-col gap-6">

      <div className="pt-2">
        <h1 className="font-display font-medium text-warm-900 text-3xl leading-snug mb-2">
          A little about you.
        </h1>
        <p className="text-warm-500 leading-relaxed">
          Tell us a bit about yourself so we can have better conversations. Everything is optional.
        </p>
      </div>

      <div className="flex flex-col gap-5">

        <div className="flex flex-col gap-2">
          <Label htmlFor="preferred-name">What would you like us to call you?</Label>
          <Input
            id="preferred-name"
            placeholder="e.g. Dot, Margaret, Maggie…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="interests">What do you enjoy?</Label>
          <Textarea
            id="interests"
            placeholder="e.g. Family, gardening, music, reading…"
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dislikes">Is there anything you'd rather not talk about?</Label>
          <Textarea
            id="dislikes"
            placeholder="e.g. Anything that upsets or stresses you…"
            rows={2}
          />
        </div>

      </div>

      <Button
        className="w-full bg-teal text-ivory hover:bg-teal-light text-base py-6"
        onClick={() => router.push("/home")}
      >
        I'm done
      </Button>

    </div>
  )
}
