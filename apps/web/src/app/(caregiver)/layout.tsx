import { CaregiverShell } from "@/components/caregiver/layout/caregiver-shell"

export default function CaregiverLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CaregiverShell>{children}</CaregiverShell>
}