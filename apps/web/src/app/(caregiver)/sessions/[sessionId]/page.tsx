import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { EmptyState } from "@/components/common/empty-state"

export const metadata: Metadata = { title: "Session Detail" }

function SectionCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-card px-6 py-6">
      <h2 className="font-display font-medium text-warm-900 text-base mb-4">{heading}</h2>
      {children}
    </div>
  )
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-warm-500">{label}</span>
      <span className="text-sm text-warm-900 font-medium">{value}</span>
    </div>
  )
}

const DOMAINS = ["Memory", "Language", "Attention", "Executive function"]

const WELLBEING_QUESTIONS = [
  "How are you feeling today?",
  "Have you slept well recently?",
  "Have you seen anyone you care about lately?",
  "Is there anything worrying you?",
]

export default async function SessionDetailPage(props: {
  params: Promise<{ sessionId: string }>
}) {
  const params = await props.params

  return (
    <div className="p-8 min-h-screen bg-ivory">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div className="flex items-center gap-3">
          <Link
            href="/sessions"
            className="w-8 h-8 rounded-lg bg-white border border-border flex items-center justify-center hover:bg-ivory transition-colors"
          >
            <ArrowLeft size={15} className="text-warm-700" />
          </Link>
          <div>
            <p className="text-xs text-warm-500 font-mono">{params.sessionId}</p>
            <h1 className="font-display font-medium text-warm-900 text-2xl">Session detail</h1>
          </div>
        </div>

        <SectionCard heading="Domain performance">
          <div className="grid grid-cols-2 gap-3">
            {DOMAINS.map((domain) => (
              <div key={domain} className="bg-ivory rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-warm-900 font-medium">{domain}</span>
                <span className="text-sm text-warm-300 font-medium">—</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard heading="Notable signals">
          <EmptyState
            icon={AlertTriangle}
            heading="No signals flagged"
            description="nAIber didn't detect anything unusual in this session."
            compact
          />
        </SectionCard>

        <SectionCard heading="Wellbeing check">
          <div className="flex flex-col divide-y divide-border">
            {WELLBEING_QUESTIONS.map((q) => (
              <div key={q} className="py-3 flex items-start justify-between gap-4">
                <span className="text-sm text-warm-700">{q}</span>
                <span className="text-sm text-warm-300 shrink-0">—</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard heading="Session info">
          <KVRow label="Call outcome" value="—" />
          <KVRow label="Duration" value="—" />
          <KVRow label="Content set" value="—" />
          <KVRow label="Test version" value="—" />
        </SectionCard>

      </div>
    </div>
  )
}
