import type { Metadata } from "next"
import Link from "next/link"
import { Users, BarChart2, Calendar, Flag } from "lucide-react"

import { EmptyState } from "@/components/common/empty-state"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = { title: "Dashboard" }

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-card px-6 py-6 ${className ?? ""}`}>
      {children}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-medium text-warm-900 text-lg mb-4">{children}</h2>
  )
}

export default function DashboardPage() {
  const hasUser = false // no backend yet — shows empty state

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="font-display font-medium text-warm-900 text-2xl mb-1">Dashboard</h1>
          <p className="text-sm text-warm-500">Overview of check-in activity and wellness trends.</p>
        </div>

        {!hasUser ? (
          <SectionCard>
            <EmptyState
              icon={Users}
              heading="No one added yet"
              description="Add the person you're caring for to see their check-in activity, stability trends, and session history."
              action={{ label: "Add a person", href: "/onboarding/0" }}
            />
          </SectionCard>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <SectionCard>
                <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Activation</p>
                <Badge variant="outline">Awaiting activation</Badge>
                <p className="text-xs text-warm-500 mt-2">Activation call scheduled after setup.</p>
              </SectionCard>
              <SectionCard>
                <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Last check-in</p>
                <EmptyState icon={Calendar} heading="No check-ins yet" compact />
              </SectionCard>
              <SectionCard>
                <p className="text-xs text-warm-500 uppercase tracking-widest font-medium mb-2">Next call</p>
                <p className="text-sm text-warm-500">Scheduling after activation.</p>
              </SectionCard>
            </div>

            <SectionCard>
              <SectionHeading>Stability overview</SectionHeading>
              <div className="h-48 bg-ivory rounded-xl border-2 border-dashed border-warm-300 flex flex-col items-center justify-center gap-2">
                <BarChart2 size={32} className="text-warm-300" strokeWidth={1.5} />
                <p className="text-sm text-warm-500">Stability data will appear after 3 sessions</p>
              </div>
            </SectionCard>

            <SectionCard>
              <div className="flex items-center justify-between mb-4">
                <SectionHeading>Recent sessions</SectionHeading>
                <Link href="/sessions" className="text-xs text-teal hover:text-teal-light font-medium">
                  View all
                </Link>
              </div>
              <EmptyState
                icon={Calendar}
                heading="No sessions recorded yet"
                description="Sessions will appear here after nAIber begins calling."
                compact
              />
            </SectionCard>

            <SectionCard>
              <SectionHeading>Active flags</SectionHeading>
              <EmptyState
                icon={Flag}
                heading="No flags"
                description="nAIber hasn't detected anything requiring attention."
                compact
              />
            </SectionCard>
          </>
        )}
      </div>
    </div>
  )
}
