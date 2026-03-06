"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepLayout } from "../step-layout"

const schema = z.object({
  educationLevel: z.string().optional(),
  memoryConcerns: z.enum(["yes", "no", "unsure"]).optional(),
  cognitiveChecksEnabled: z.boolean(),
  communicationStyle: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const EDUCATION_LEVELS = [
  "No formal education",
  "Primary school",
  "Some high school",
  "High school diploma",
  "Some college / trade school",
  "Bachelor's degree",
  "Graduate degree",
]

export function Step4Cognitive() {
  const router = useRouter()

  const {
    control,
    handleSubmit,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { cognitiveChecksEnabled: true },
  })

  function onSuccess() {
    router.push("/onboarding/5")
  }

  return (
    <StepLayout
      step={4}
      heading="Cognitive baseline"
      onBack={() => router.push("/onboarding/3")}
      onContinue={handleSubmit(onSuccess)}
    >

      {/* Preamble callout */}
      <div className="bg-teal/5 border border-teal/20 rounded-xl p-4">
        <p className="text-sm text-warm-700 leading-relaxed">
          These questions help us understand their baseline so we can track changes
          accurately over time.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Education level</Label>
        <Controller
          name="educationLevel"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select education level" />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Have you noticed memory concerns?</Label>
        <Controller
          name="memoryConcerns"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="grid grid-cols-3 gap-3"
            >
              {[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "unsure", label: "Unsure" },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  htmlFor={`memory-${value}`}
                  className={`flex items-center justify-center rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                    field.value === value
                      ? "border-teal bg-teal/5"
                      : "border-border hover:border-warm-300"
                  }`}
                >
                  <RadioGroupItem
                    id={`memory-${value}`}
                    value={value}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-warm-900">{label}</span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-medium text-warm-900">Enable cognitive wellness checks</p>
          <p className="text-xs text-warm-500 mt-0.5">
            nAIber will include gentle assessments during calls
          </p>
        </div>
        <Controller
          name="cognitiveChecksEnabled"
          control={control}
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="commStyle">Communication style</Label>
        <Controller
          name="communicationStyle"
          control={control}
          render={({ field }) => (
            <Textarea
              id="commStyle"
              placeholder="e.g. She prefers simple, direct questions and responds well to humour…"
              rows={3}
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>

    </StepLayout>
  )
}
