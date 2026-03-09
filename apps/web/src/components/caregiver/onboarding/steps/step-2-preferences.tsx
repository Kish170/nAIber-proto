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
import { CallTime, CallFrequency, CALL_TIME_OPTIONS, INTEREST_SUGGESTIONS } from "@/types/onboarding"

const schema = z.object({
  callTime: z.enum(["morning", "afternoon", "evening"], {
    errorMap: () => ({ message: "Please select a preferred call time" }),
  }),
  callFrequency: z.enum(["daily", "weekly"], {
    errorMap: () => ({ message: "Please select a call frequency" }),
  }),
  interests: z.string().optional(),
  dislikes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function Step2Preferences() {
  const router = useRouter()

  const store = useOnboardingStore()

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      callTime: store.data.callTime as FormData['callTime'] ?? undefined,
      callFrequency: store.data.callFrequency as FormData['callFrequency'] ?? undefined,
      interests: store.data.interests ?? "",
      dislikes: store.data.dislikes ?? "",
    },
  })

  const currentInterests = watch("interests") ?? ""

  function addPill(pill: string) {
    const existing = currentInterests.split(",").map((s) => s.trim()).filter(Boolean)
    if (!existing.includes(pill)) {
      const updated = [...existing, pill].join(", ")
      setValue("interests", updated)
    }
  }

  function onSuccess(data: FormData) {
    store.updateStep(2, data)
    router.push("/onboarding/3")
  }

  return (
    <StepLayout
      step={2}
      heading="Communication preferences"
      subtitle="Help nAIber call at the right time and talk about the right things."
      onBack={() => router.push("/onboarding/1")}
      onContinue={handleSubmit(onSuccess)}
    >

      <div className="flex flex-col gap-2">
        <Label>Preferred call time</Label>
        <Controller
          name="callTime"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="grid grid-cols-3 gap-3"
            >
              {CALL_TIME_OPTIONS.map(({ value, label, sub }) => (
                <label
                  key={value}
                  htmlFor={`callTime-${value}`}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                    field.value === value
                      ? "border-teal bg-teal/5"
                      : "border-border hover:border-warm-300"
                  }`}
                >
                  <RadioGroupItem
                    id={`callTime-${value}`}
                    value={value}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-warm-900">{label}</span>
                  <span className="text-xs text-warm-500">{sub}</span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
        {errors.callTime && (
          <p className="text-xs text-destructive">{errors.callTime.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Call frequency</Label>
        <Controller
          name="callFrequency"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="grid grid-cols-2 gap-3"
            >
              {[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  htmlFor={`freq-${value}`}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                    field.value === value
                      ? "border-teal bg-teal/5"
                      : "border-border hover:border-warm-300"
                  }`}
                >
                  <RadioGroupItem
                    id={`freq-${value}`}
                    value={value}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-warm-900">{label}</span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
        {errors.callFrequency && (
          <p className="text-xs text-destructive">{errors.callFrequency.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="interests">Interests</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {INTEREST_SUGGESTIONS.map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => addPill(pill)}
              className="text-xs px-3 py-1 rounded-full border border-warm-300 text-warm-500 hover:border-teal hover:text-teal transition-colors"
            >
              + {pill}
            </button>
          ))}
        </div>
        <Controller
          name="interests"
          control={control}
          render={({ field }) => (
            <Textarea
              id="interests"
              placeholder="e.g. Family, Gardening, Music…"
              rows={2}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dislikes">Dislikes or topics to avoid</Label>
        <Controller
          name="dislikes"
          control={control}
          render={({ field }) => (
            <Textarea
              id="dislikes"
              placeholder="e.g. Politics, loud environments…"
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
