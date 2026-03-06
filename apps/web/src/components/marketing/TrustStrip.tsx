import { Phone, Shield, TrendingUp, Heart } from "lucide-react"

const ITEMS = [
  { icon: Phone,      label: "Simple phone calls" },
  { icon: Shield,     label: "Private & secure" },
  { icon: TrendingUp, label: "Gentle trend insights" },
  { icon: Heart,      label: "Not a medical tool" },
]

export function TrustStrip() {
  return (
    <div className="border-y border-border py-5 bg-ivory-deep">
      <div className="max-w-[900px] mx-auto px-8 flex items-center justify-center gap-12 flex-wrap">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon size={16} className="text-teal" strokeWidth={1.8} />
            <span className="text-sm text-warm-700">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
