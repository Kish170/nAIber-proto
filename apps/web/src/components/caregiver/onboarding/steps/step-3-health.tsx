"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"
import { X, Plus } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepLayout } from "../step-layout"
import { useOnboardingStore } from "@/stores/onboarding.store"
import {
  SUGGESTED_CONDITIONS,
  FREQUENCY_OPTIONS,
  type Medication,
  type MedicationSchedule,
} from "@/types/onboarding"

const medicationSchema = z.object({
  name: z.string(),
  dosage: z.string(),
  frequency: z.record(z.unknown()),
})

const schema = z.object({
  conditions: z.array(z.string()).optional(),
  medications: z.array(medicationSchema).optional(),
})

type FormData = z.infer<typeof schema>

export function Step3Health() {
  const router = useRouter()
  const store = useOnboardingStore()
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(store.data.conditions ?? [])
  const [medications, setMedications] = useState<Medication[]>(store.data.medications ?? [])

  const { handleSubmit } = useForm<FormData>({ resolver: zodResolver(schema) })

  function addTag(value: string) {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed])
    }
    setTagInput("")
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  function addMedication() {
    setMedications((prev) => [...prev, { name: "", dosage: "", frequency: "" }])
  }

  function updateMedication(index: number, field: keyof Medication, value: string) {
    setMedications((prev) =>
      prev.map((med, i) => (i === index ? { ...med, [field]: value } : med))
    )
  }

  function removeMedication(index: number) {
    setMedications((prev) => prev.filter((_, i) => i !== index))
  }

  function onSuccess() {
    store.updateStep(3, { conditions: tags, medications })
    router.push("/onboarding/4")
  }

  return (
    <StepLayout
      step={3}
      heading="Health context"
      subtitle="This helps nAIber ask relevant questions and notice changes over time."
      onBack={() => router.push("/onboarding/2")}
      onContinue={handleSubmit(onSuccess)}
    >

      {/* Health conditions */}
      <div className="flex flex-col gap-2">
        <Label>Health conditions</Label>

        <div className="flex flex-wrap gap-2 mb-1">
          {SUGGESTED_CONDITIONS.map((cond) => (
            <button
              key={cond}
              type="button"
              onClick={() => addTag(cond)}
              className="text-xs px-3 py-1 rounded-full border border-warm-300 text-warm-500 hover:border-teal hover:text-teal transition-colors"
            >
              + {cond}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal/10 text-teal text-xs font-medium"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-teal"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Type a condition and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addTag(tagInput)
              }
            }}
          />
        </div>
      </div>

      {/* Medications */}
      <div className="flex flex-col gap-2">
        <Label>Medications</Label>

        {medications.length > 0 && (
          <div className="flex flex-col gap-3">
            {medications.map((med, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start"
              >
                <div className="flex flex-col gap-1">
                  <Input
                    placeholder="Name"
                    value={med.name}
                    onChange={(e) => updateMedication(i, "name", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Input
                    placeholder="Dosage"
                    value={med.dosage}
                    onChange={(e) => updateMedication(i, "dosage", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Select
                    value={FREQUENCY_OPTIONS.find(o =>
                      JSON.stringify(o.schedule) === JSON.stringify(med.frequency)
                    )?.label ?? ''}
                    onValueChange={(label) => {
                      const opt = FREQUENCY_OPTIONS.find(o => o.label === label)
                      if (opt) updateMedication(i, "frequency", opt.schedule)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.label} value={opt.label}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => removeMedication(i)}
                  className="mt-2.5 text-warm-500 hover:text-destructive transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addMedication}
          className="flex items-center gap-1.5 text-sm text-teal hover:text-teal-light font-medium self-start"
        >
          <Plus size={14} />
          Add medication
        </button>
      </div>

    </StepLayout>
  )
}
