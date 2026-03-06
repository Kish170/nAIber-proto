import type { Metadata } from "next"
import { VerifyPage } from "./verify-page"

export const metadata: Metadata = { title: "Check Your Email" }

export default function VerifyRoute() {
  return <VerifyPage />
}
