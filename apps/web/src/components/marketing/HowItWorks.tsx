const STEPS = [
  {
    step: "01",
    title: "nAIber calls",
    body: "A warm, conversational check-in happens regularly — at a time that feels natural to your loved one.",
  },
  {
    step: "02",
    title: "They just talk",
    body: "No app to download, no buttons to press. Just a friendly voice asking how they're feeling and what's on their mind.",
  },
  {
    step: "03",
    title: "You stay informed",
    body: "Gentle summaries and subtle trend observations arrive in your dashboard — so you can notice changes before they escalate.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-[1100px] mx-auto px-8 py-24">
      <div className="text-center mb-14">
        <p className="text-xs text-teal uppercase tracking-[0.1em] font-medium mb-3">
          How it works
        </p>
        <h2 className="font-display font-medium text-warm-900 text-[2rem]">
          As simple as a phone call.
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {STEPS.map(({ step, title, body }) => (
          <div
            key={step}
            className="rounded-2xl p-8 bg-ivory-deep border border-[rgba(44,40,37,0.06)]"
          >
            {/* Step number — teal at 40% opacity */}
            <div
              className="font-display text-[2.5rem] leading-none mb-6"
              style={{ color: "var(--color-teal)", opacity: 0.4 }}
            >
              {step}
            </div>
            <h3 className="font-display font-medium text-warm-900 text-lg mb-3">
              {title}
            </h3>
            <p className="text-sm text-warm-700 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
