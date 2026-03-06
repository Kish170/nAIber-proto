import type { Metadata } from "next"
import { SignupForm } from "./signup-form"

export const metadata: Metadata = { title: "Get Started" }

export default function SignupPage() {
  return <SignupForm />
}
