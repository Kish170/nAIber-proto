"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { StepLayout } from "../step-layout"
import { useOnboardingStore } from "@/stores/onboarding.store"
import {
  ChangeLevel,
  CHANGE_LEVEL_LABELS,
  OBSERVATION_QUESTIONS,
} from "@/types/onboarding"

const changeOptions = Object.values(ChangeLevel)

const questionSchema = z.enum(changeOptions as [string, ...string[]]).optional()

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

  const store = useOnboardingStore()

  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      q1: store.data.observations?.q1 ?? undefined,
      q2: store.data.observations?.q2 ?? undefined,
      q3: store.data.observations?.q3 ?? undefined,
      q4: store.data.observations?.q4 ?? undefined,
      q5: store.data.observations?.q5 ?? undefined,
      q6: store.data.observations?.q6 ?? undefined,
      q7: store.data.observations?.q7 ?? undefined,
      otherNotes: store.data.observations?.otherNotes ?? "",
      changeOnset: store.data.observations?.changeOnset ?? "",
    },
  })

  function onSuccess(data: FormData) {
    store.updateStep(5, { observations: data })
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
        {OBSERVATION_QUESTIONS.map(({ key, label }) => (
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
                        {CHANGE_LEVEL_LABELS[opt as ChangeLevel]}
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
