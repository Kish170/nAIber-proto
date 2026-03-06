import { Lock, EyeOff, UserCheck, FileX } from "lucide-react"

const ITEMS = [
  {
    icon: Lock,
    title: "Conversations stay private",
    body: "Calls are analyzed for patterns and wellbeing signals — not stored as recordings. No audio is retained after processing.",
  },
  {
    icon: EyeOff,
    title: "Summaries, not transcripts",
    body: "Caregivers see observations and trends over time, not word-for-word accounts of what was said.",
  },
  {
    icon: UserCheck,
    title: "Consent at every step",
    body: "Your loved one is introduced to nAIber before any calls begin, and can opt out at any time — no questions asked.",
  },
  {
    icon: FileX,
    title: "Not a medical record",
    body: "Observations are for family awareness only. Nothing is shared with insurers, clinicians, or any third party.",
  },
]

export function Privacy() {
  return (
    <section id="privacy" className="max-w-[1100px] mx-auto px-8 py-24">
      <div className="text-center mb-14">
        <p className="text-xs text-teal uppercase tracking-[0.1em] font-medium mb-3">
          Privacy
        </p>
        <h2 className="font-display font-medium text-warm-900 text-[2rem]">
          Built on trust, not surveillance.
        </h2>
        <p
          className="text-warm-700 leading-relaxed mt-4 mx-auto max-w-[480px]"
          style={{ fontSize: "0.95rem" }}
        >
          nAIber is a companion, not a monitoring tool. Here's exactly what
          we collect, and what we don't.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-2xl p-8 bg-ivory-deep border border-[rgba(44,40,37,0.06)] flex gap-5"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{ backgroundColor: "#5B8C8A1A" }}
            >
              <Icon size={18} className="text-teal" strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="font-display font-medium text-warm-900 text-base mb-2">
                {title}
              </h3>
              <p className="text-sm text-warm-700 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}