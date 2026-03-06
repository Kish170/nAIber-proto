import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { WelcomeStep1 } from "@/components/elderly/welcome/welcome-step-1"
import { WelcomeStep2 } from "@/components/elderly/welcome/welcome-step-2"

export const metadata: Metadata = { title: "Getting Started" }

export default async function WelcomeStepPage(props: {
  params: Promise<{ step: string }>
}) {
  const params = await props.params
  const step = params.step

  if (step !== "1" && step !== "2") {
    redirect("/welcome/1")
  }

  return step === "1" ? <WelcomeStep1 /> : <WelcomeStep2 />
}
