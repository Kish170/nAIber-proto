interface OnboardingProgressProps {
  currentStep: number // 1–7
}

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  return (
    <div className="mb-6">
      <div className="flex gap-1.5 mb-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < currentStep ? "bg-teal" : "bg-ivory-deep"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-warm-500 font-medium">Step {currentStep} of 7</p>
    </div>
  )
}
