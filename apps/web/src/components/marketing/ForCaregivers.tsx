const CAREGIVER_PHOTO =
  "https://images.unsplash.com/photo-1637941881697-54cdeaacf0e1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXJlZ2l2ZXIlMjBmYW1pbHklMjBjb25uZWN0aW9uJTIwZ2VudGxlJTIwbW9tZW50fGVufDF8fHx8MTc3MjY4NjY4Mnww&ixlib=rb-4.1.0&q=80&w=1080"

const BULLETS = [
  "Behavioral patterns over weeks and months",
  "Mood and engagement trends",
  "Notable moments, not daily reports",
  "Observations, never diagnoses",
]

export function ForCaregivers() {
  return (
    <section id="for-families" className="bg-ivory-deep border-y border-border">
      <div className="grid grid-cols-1 md:grid-cols-2 max-w-[1100px] mx-auto">

        <div className="p-12 md:p-16 flex flex-col justify-center">
          <p className="text-xs text-teal uppercase tracking-[0.1em] font-medium mb-4">
            For caregivers
          </p>
          <h2
            className="font-display font-medium text-warm-900 leading-snug mb-4"
            style={{ fontSize: "1.9rem" }}
          >
            Peace of mind,{" "}
            <em>gently delivered.</em>
          </h2>
          <p
            className="text-warm-700 leading-relaxed mb-8"
            style={{ fontSize: "0.95rem" }}
          >
            You don't need to worry about whether Mom is doing okay today. nAIber
            notices the small things — so you can see the full picture without being
            overwhelmed.
          </p>

          <ul className="flex flex-col gap-4">
            {BULLETS.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#5B8C8A1A" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-teal" />
                </div>
                <span className="text-sm text-warm-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative min-h-72 md:min-h-0 overflow-hidden border-l border-border">
          <img
            src={CAREGIVER_PHOTO}
            alt="Caregiver and family"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </section>
  )
}