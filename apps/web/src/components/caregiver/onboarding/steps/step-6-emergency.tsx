"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepLayout } from "../step-layout"
import { useOnboardingStore } from "@/stores/onboarding.store"
import { EMERGENCY_RELATIONSHIPS } from "@/types/onboarding"

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().min(1, "Phone number is required"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  relationship: z.string().optional(),
  notifyOnMissedCall: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function Step6Emergency() {
  const router = useRouter()

  const store = useOnboardingStore()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: store.data.emergencyContact?.name ?? "",
      phone: store.data.emergencyContact?.phone ?? "",
      email: store.data.emergencyContact?.email ?? "",
      relationship: store.data.emergencyContact?.relationship ?? undefined,
      notifyOnMissedCall: store.data.emergencyContact?.notifyOnMissedCall ?? true,
    },
  })

  function onSuccess(data: FormData) {
    store.updateStep(6, { emergencyContact: data })
    router.push("/onboarding/7")
  }

  return (
    <StepLayout
      step={6}
      heading="Emergency contact"
      subtitle="Who should we reach out to if nAIber notices something unusual?"
      onBack={() => router.push("/onboarding/5")}
      onContinue={handleSubmit(onSuccess)}
    >

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ecName">Full name</Label>
        <Input
          id="ecName"
          placeholder="John Thompson"
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ecPhone">Phone number</Label>
        <Input
          id="ecPhone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="ecEmail">Email</Label>
          <span className="text-xs text-warm-500">optional</span>
        </div>
        <Input
          id="ecEmail"
          type="email"
          placeholder="john@example.com"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Relationship</Label>
        <Controller
          name="relationship"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                {EMERGENCY_RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-medium text-warm-900">Notify on missed call</p>
          <p className="text-xs text-warm-500 mt-0.5">
            Alert this contact if nAIber detects a missed call
          </p>
        </div>
        <Controller
          name="notifyOnMissedCall"
          control={control}
          render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

    </StepLayout>
  )
}
