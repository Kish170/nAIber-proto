"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Phone, Bell, Brain, Shield } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { StepLayout } from "../step-layout"

const schema = z.object({
  grantDashboardAccess: z.enum(["yes", "no"], {
    message: "Please select an option",
  }),
  elderlyEmail: z.string().optional(),
  acknowledged: z.literal(true, { message: "Please confirm before completing setup" }),
}).superRefine((data, ctx) => {
  if (
    data.grantDashboardAccess === "yes" &&
    (!data.elderlyEmail || !z.string().email().safeParse(data.elderlyEmail).success)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a valid email address",
      path: ["elderlyEmail"],
    })
  }
})

type FormData = z.infer<typeof schema>

const SUMMARY_ITEMS = [
  {
    icon: Phone,
    title: "Regular calls",
    description: "nAIber will call at the times and frequency you set.",
  },
  {
    icon: Bell,
    title: "Smart reminders",
    description: "Medication and appointment reminders woven naturally into conversation.",
  },
  {
    icon: Brain,
    title: "Cognitive wellness",
    description: "Gentle check-ins to track changes over time.",
  },
  {
    icon: Shield,
    title: "You stay informed",
    description: "Summaries and alerts sent to you after each call.",
  },
]

export function Step7Activation() {
  const router = useRouter()

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const grantAccess = useWatch({ control, name: "grantDashboardAccess" })

  function onSuccess() {
    router.push("/dashboard")
  }

  return (
    <StepLayout
      step={7}
      heading="Activate nAIber"
      subtitle="You're almost there. Review what happens next and complete the setup."
      continueLabel="Complete setup"
      onBack={() => router.push("/onboarding/6")}
      onContinue={handleSubmit(onSuccess)}
    >

      {/* Part A: Dashboard access */}
      <div className="flex flex-col gap-2">
        <Label>Would they like access to their own simplified nAIber dashboard?</Label>
        <Controller
          name="grantDashboardAccess"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="grid grid-cols-2 gap-3"
            >
              {[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No, not now" },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  htmlFor={`access-${value}`}
                  className={`flex items-center justify-center rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                    field.value === value
                      ? "border-teal bg-teal/5"
                      : "border-border hover:border-warm-300"
                  }`}
                >
                  <RadioGroupItem
                    id={`access-${value}`}
                    value={value}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-warm-900">{label}</span>
                </label>
              ))}
            </RadioGroup>
          )}
        />
        {errors.grantDashboardAccess && (
          <p className="text-xs text-destructive">{errors.grantDashboardAccess.message}</p>
        )}

        {grantAccess === "yes" && (
          <div className="flex flex-col gap-1.5 mt-2">
            <Label htmlFor="elderlyEmail">Their email address</Label>
            <Controller
              name="elderlyEmail"
              control={control}
              render={({ field }) => (
                <Input
                  id="elderlyEmail"
                  type="email"
                  placeholder="margaret@example.com"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
            {errors.elderlyEmail && (
              <p className="text-xs text-destructive">{errors.elderlyEmail.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Part B: Summary */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-warm-700">Here's what nAIber will do</p>
        <div className="grid grid-cols-1 gap-2">
          {SUMMARY_ITEMS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-xl bg-ivory p-3"
            >
              <span className="w-8 h-8 rounded-full bg-teal/10 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-teal" />
              </span>
              <div>
                <p className="text-sm font-medium text-warm-900">{title}</p>
                <p className="text-xs text-warm-500 mt-0.5">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Acknowledgment */}
      <Controller
        name="acknowledged"
        control={control}
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="acknowledged"
                checked={field.value === true}
                onCheckedChange={(checked) =>
                  field.onChange(checked === true ? true : undefined)
                }
                className="mt-0.5"
              />
              <label
                htmlFor="acknowledged"
                className="text-sm text-warm-700 leading-snug cursor-pointer"
              >
                I have discussed nAIber with them and they understand what to expect.
              </label>
            </div>
            {errors.acknowledged && (
              <p className="text-xs text-destructive pl-8">{errors.acknowledged.message}</p>
            )}
          </div>
        )}
      />

    </StepLayout>
  )
}
