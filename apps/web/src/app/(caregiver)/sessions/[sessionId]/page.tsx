import type { Metadata } from "next"

export const metadata: Metadata = { title: "Session Detail" }

export default function SessionDetailPage({
  params,
}: {
  params: { sessionId: string }
}) {
  return (
    <div className="p-8">
      <p className="text-xs text-warm-500 mb-1">Session</p>
      <h1 className="font-display font-medium text-warm-900 text-2xl mb-2">
        Session Detail
      </h1>
      <p className="text-warm-500 text-sm font-mono">{params.sessionId}</p>
      <p className="text-warm-500 text-sm mt-4">
        Domain scores, notable signals, wellbeing check, distress flag, content set used.
      </p>
    </div>
  )
}
