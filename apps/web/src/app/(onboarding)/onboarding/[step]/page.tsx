import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { Step0Intro } from "@/components/caregiver/onboarding/steps/step-0-intro"
import { Step1Profile } from "@/components/caregiver/onboarding/steps/step-1-profile"
import { Step2Preferences } from "@/components/caregiver/onboarding/steps/step-2-preferences"
import { Step3Health } from "@/components/caregiver/onboarding/steps/step-3-health"
import { Step4Cognitive } from "@/components/caregiver/onboarding/steps/step-4-cognitive"
import { Step5Observations } from "@/components/caregiver/onboarding/steps/step-5-observations"
import { Step6Emergency } from "@/components/caregiver/onboarding/steps/step-6-emergency"
import { Step7Activation } from "@/components/caregiver/onboarding/steps/step-7-activation"

export const metadata: Metadata = { title: "Onboarding" }

const STEP_MAP = {
  0: Step0Intro,
  1: Step1Profile,
  2: Step2Preferences,
  3: Step3Health,
  4: Step4Cognitive,
  5: Step5Observations,
  6: Step6Emergency,
  7: Step7Activation,
} as const

export default async function OnboardingStepPage(props: {
  params: Promise<{ step: string }>
}) {
  const params = await props.params
  const stepNum = parseInt(params.step, 10)

  if (isNaN(stepNum) || stepNum < 0 || stepNum > 7) {
    redirect("/onboarding/0")
  }

  const StepComponent = STEP_MAP[stepNum as keyof typeof STEP_MAP]

  return <StepComponent />
}
