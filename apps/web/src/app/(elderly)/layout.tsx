import { ElderlyShell } from "@/components/elderly/layout/elderly-shell"

export default function ElderlyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ElderlyShell>{children}</ElderlyShell>
}
