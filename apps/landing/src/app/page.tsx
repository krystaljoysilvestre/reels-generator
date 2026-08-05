import { Access } from '@/components/access'
import { Channels } from '@/components/channels'
import { FeatureSplit } from '@/components/feature-split'
import { FeaturedFrame } from '@/components/featured-frame'
import { Faq } from '@/components/faq'
import { Footer, MetaStrip, Nav } from '@/components/chrome'
import { Hero } from '@/components/hero'
import { Philosophy } from '@/components/philosophy'
import { Problem } from '@/components/problem'
import { Process } from '@/components/process'
import { Roadmap } from '@/components/roadmap'

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-night">
      {/* ambient light-leaks + film grain */}
      <div className="kx-leak pointer-events-none absolute -right-[120px] -top-[180px] h-[800px] w-[800px] rounded-full bg-[radial-gradient(circle,rgba(255,45,155,0.22),transparent_62%)]" />
      <div className="kx-leak pointer-events-none absolute -left-[240px] top-[180px] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgba(47,164,255,0.17),transparent_62%)] [animation-delay:-4s]" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] mix-blend-soft-light"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="kx-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#kx-grain)" />
      </svg>

      <MetaStrip />
      <Nav />
      <Hero />
      <Problem />
      <FeaturedFrame />
      <Process />
      <FeatureSplit />
      <Channels />
      <Philosophy />
      <Roadmap />
      <Faq />
      <Access />
      <Footer />
    </div>
  )
}
