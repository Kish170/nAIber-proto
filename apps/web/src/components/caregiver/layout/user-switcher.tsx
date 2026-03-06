import Link from "next/link"
import { Plus } from "lucide-react"

export function UserSwitcher() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-[10px] text-warm-500 uppercase tracking-widest font-medium mb-2 px-1">
        My people
      </p>

      <div className="bg-ivory rounded-xl p-3 flex flex-col gap-2">
        <p className="text-xs text-warm-500 leading-snug">
          No one added yet.
        </p>
        <Link
          href="/onboarding/0"
          className="inline-flex items-center gap-1 text-xs text-teal font-medium hover:text-teal-light transition-colors"
        >
          <Plus size={12} />
          Add a person
        </Link>
      </div>
    </div>
  )
}
