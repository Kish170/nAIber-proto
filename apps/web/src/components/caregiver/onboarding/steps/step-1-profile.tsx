"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StepLayout } from "../step-layout"
import { useOnboardingStore } from "@/stores/onboarding.store"
import { Gender } from "@/types/onboarding"

const schema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().optional(),
  phone: z.string().min(1, "Phone number is required"),
  language: z.string().optional(),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
})

type FormData = z.infer<typeof schema>

export function Step1Profile() {
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
      fullName: store.data.fullName ?? "",
      dateOfBirth: store.data.dateOfBirth ?? "",
      gender: store.data.gender ?? undefined,
      phone: store.data.phone ?? "",
      language: store.data.language ?? undefined,
      email: store.data.email ?? "",
    },
  })

  function onSuccess(data: FormData) {
    store.updateStep(1, data)
    router.push("/onboarding/2")
  }

  return (
    <StepLayout
      step={1}
      heading="Basic profile"
      note="Fill in what you know — you can update anything later."
      onBack={() => router.push("/onboarding/0")}
      onContinue={handleSubmit(onSuccess)}
    >

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          placeholder="Margaret Thompson"
          {...register("fullName")}
        />
        {errors.fullName && (
          <p className="text-xs text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dateOfBirth">Date of birth</Label>
        <Input
          id="dateOfBirth"
          type="date"
          {...register("dateOfBirth")}
        />
        {errors.dateOfBirth && (
          <p className="text-xs text-destructive">{errors.dateOfBirth.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Gender</Label>
        <Controller
          name="gender"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={Gender.FEMALE}>Female</SelectItem>
                <SelectItem value={Gender.MALE}>Male</SelectItem>
                <SelectItem value={Gender.NON_BINARY}>Non-binary</SelectItem>
                <SelectItem value={Gender.PREFER_NOT_TO_SAY}>Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Primary language</Label>
        <Controller
          name="language"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="french">French</SelectItem>
                <SelectItem value="spanish">Spanish</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="email">Email</Label>
          <span className="text-xs text-warm-500">Only needed if they want web access</span>
        </div>
        <Input
          id="email"
          type="email"
          placeholder="margaret@example.com"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

    </StepLayout>
  )
}
