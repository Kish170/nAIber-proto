"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Logo } from "@/components/common/logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

const schema = z.object({
  consentData: z.literal(true, {
    errorMap: () => ({ message: "You must accept this to continue" }),
  }),
  consentTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to continue" }),
  }),
})

type FormData = z.infer<typeof schema>

const STEPS_PREVIEW = [
  "Basic profile — name, date of birth, language",
  "Communication preferences — best call times and interests",
  "Health context — conditions and medications",
  "Cognitive baseline — education and memory context",
  "Observations — changes you've noticed over time",
  "Emergency contact — who to notify if needed",
  "Activation — review and launch nAIber",
]

export function Step0Intro() {
  const router = useRouter()

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  function onSubmit() {
    router.push("/onboarding/1")
  }

  return (
    <div className="min-h-full bg-ivory p-8">
      <div className="max-w-lg mx-auto">

        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="bg-white rounded-2xl shadow-elevated px-8 py-10">
          <h1 className="font-display font-medium text-warm-900 text-[1.75rem] leading-snug mb-3">
            Let's set up your loved one's profile.
          </h1>
          <p className="text-sm text-warm-500 mb-8">
            nAIber makes warm, personalised phone calls to help your loved one feel connected and supported. The information you provide helps nAIber remember who they are, what they care about, and when to reach out — so every call feels natural.
          </p>

          <div className="bg-ivory rounded-xl p-5 mb-8">
            <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-3">
              What we'll cover
            </p>
            <ul className="flex flex-col gap-2.5">
              {STEPS_PREVIEW.map((label, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-teal/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs text-teal font-semibold">{i + 1}</span>
                  </span>
                  <span className="text-sm text-warm-700">{label}</span>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">

            <Controller
              name="consentData"
              control={control}
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consentData"
                      checked={field.value === true}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true ? true : undefined)
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="consentData"
                      className="text-sm text-warm-700 leading-snug cursor-pointer"
                    >
                      I understand that the information I provide is used only to personalise
                      nAIber's conversations and will not be shared with third parties.
                    </label>
                  </div>
                  {errors.consentData && (
                    <p className="text-xs text-destructive pl-8">
                      {errors.consentData.message}
                    </p>
                  )}
                </div>
              )}
            />

            <Controller
              name="consentTerms"
              control={control}
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consentTerms"
                      checked={field.value === true}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true ? true : undefined)
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="consentTerms"
                      className="text-sm text-warm-700 leading-snug cursor-pointer"
                    >
                      I agree to the{" "}
                      <Link href="/terms" className="text-teal hover:underline">
                        Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="text-teal hover:underline">
                        Privacy Policy
                      </Link>
                      .
                    </label>
                  </div>
                  {errors.consentTerms && (
                    <p className="text-xs text-destructive pl-8">
                      {errors.consentTerms.message}
                    </p>
                  )}
                </div>
              )}
            />

            <Button
              type="submit"
              className="w-full bg-teal text-ivory hover:bg-teal-light mt-2"
            >
              Get started
            </Button>

          </form>
        </div>

      </div>
    </div>
  )
}
