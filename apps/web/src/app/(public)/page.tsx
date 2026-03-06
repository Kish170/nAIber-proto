import { LandingNav } from "@/components/marketing/LandingNav"
import { Hero } from "@/components/marketing/Hero"
import { TrustStrip } from "@/components/marketing/TrustStrip"
import { HowItWorks } from "@/components/marketing/HowItWorks"
import { ForCaregivers } from "@/components/marketing/ForCaregivers"
import { Privacy } from "@/components/marketing/Privacy"
import { CtaBanner } from "@/components/marketing/CtaBanner"
import { LandingFooter } from "@/components/marketing/LandingFooter"

export default function LandingPage() {
  return (
    <div className="bg-ivory min-h-screen">
      <LandingNav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <ForCaregivers />
      <Privacy />
      <CtaBanner />
      <LandingFooter />
    </div>
  )
}
