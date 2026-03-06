"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { StepLayout } from "../step-layout"

const changeOptions = ["no_change", "slight_change", "noticeable_change", "big_change"] as const
const changeLabels: Record<typeof changeOptions[number], string> = {
  no_change: "No change",
  slight_change: "Slight",
  noticeable_change: "Noticeable",
  big_change: "Big change",
}

const QUESTIONS = [
  { key: "q1", label: "Remembering things about family and friends" },
  { key: "q2", label: "Remembering things that happened recently" },
  { key: "q3", label: "Recalling conversations a few days later" },
  { key: "q4", label: "Knowing what day and month it is" },
  { key: "q5", label: "Finding their way around familiar places" },
  { key: "q6", label: "Using familiar everyday items (phone, appliances)" },
  { key: "q7", label: "Managing everyday tasks independently" },
] as const

const questionSchema = z.enum(changeOptions).optional()

const schema = z.object({
  q1: questionSchema,
  q2: questionSchema,
  q3: questionSchema,
  q4: questionSchema,
  q5: questionSchema,
  q6: questionSchema,
  q7: questionSchema,
  otherNotes: z.string().optional(),
  changeOnset: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function Step5Observations() {
  const router = useRouter()

  const { control, handleSubmit } = useForm<FormData>({ resolver: zodResolver(schema) })

  function onSuccess() {
    router.push("/onboarding/6")
  }

  return (
    <StepLayout
      step={5}
      heading="Observations"
      onBack={() => router.push("/onboarding/4")}
      onContinue={handleSubmit(onSuccess)}
    >

      {/* Preamble callout */}
      <div className="bg-teal/5 border border-teal/20 rounded-xl p-4">
        <p className="text-sm text-warm-700 leading-relaxed">
          Answer based on what you've observed compared to a few years ago. It's fine to
          leave questions blank if you're unsure.
        </p>
      </div>

      {/* 7 observation questions */}
      <div className="flex flex-col gap-6">
        {QUESTIONS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-warm-700">{label}</p>
            <Controller
              name={key as keyof FormData}
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value as string | undefined}
                  onValueChange={field.onChange}
                  className="grid grid-cols-4 gap-2"
                >
                  {changeOptions.map((opt) => (
                    <label
                      key={opt}
                      htmlFor={`${key}-${opt}`}
                      className={`flex items-center justify-center text-center rounded-lg border-2 p-2 cursor-pointer transition-colors ${
                        field.value === opt
                          ? "border-teal bg-teal/5"
                          : "border-border hover:border-warm-300"
                      }`}
                    >
                      <RadioGroupItem
                        id={`${key}-${opt}`}
                        value={opt}
                        className="sr-only"
                      />
                      <span className="text-xs font-medium text-warm-700 leading-tight">
                        {changeLabels[opt]}
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="otherNotes">Anything else you've noticed worth mentioning?</Label>
        <Controller
          name="otherNotes"
          control={control}
          render={({ field }) => (
            <Textarea
              id="otherNotes"
              placeholder="e.g. She sometimes repeats questions in the same conversation…"
              rows={3}
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="changeOnset">When did you first notice any changes, if at all?</Label>
        <Controller
          name="changeOnset"
          control={control}
          render={({ field }) => (
            <Textarea
              id="changeOnset"
              placeholder="e.g. About 2 years ago, after she moved house…"
              rows={2}
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>

    </StepLayout>
  )
}
