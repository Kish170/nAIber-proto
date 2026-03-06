"use client"

import React from "react"
import { Logo } from "@/components/common/logo"
import { Button } from "@/components/ui/button"
import { OnboardingProgress } from "./onboarding-progress"

interface StepLayoutProps {
  step: number
  heading: string
  subtitle?: string
  note?: string
  continueLabel?: string
  onBack: () => void
  onContinue: () => void
  children: React.ReactNode
}

export function StepLayout({
  step,
  heading,
  subtitle,
  note,
  continueLabel = "Continue",
  onBack,
  onContinue,
  children,
}: StepLayoutProps) {
  return (
    <div className="min-h-full bg-ivory p-8">
      <div className="max-w-lg mx-auto">

        <div className="flex justify-center mb-8">
          <Logo />
        </div>

        <OnboardingProgress currentStep={step} />

        <div className="bg-white rounded-2xl shadow-elevated px-8 py-10">
          {note && (
            <p className="text-xs text-warm-500 mb-5 italic">{note}</p>
          )}
          <h1 className="font-display font-medium text-warm-900 text-[1.6rem] leading-snug mb-1">
            {heading}
          </h1>
          {subtitle && (
            <p className="text-sm text-warm-500 mb-8">{subtitle}</p>
          )}
          <div className="mt-6 flex flex-col gap-5">
            {children}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onBack}
          >
            Back
          </Button>
          <Button
            type="button"
            className="flex-1 bg-teal text-ivory hover:bg-teal-light"
            onClick={onContinue}
          >
            {continueLabel}
          </Button>
        </div>

      </div>
    </div>
  )
}
