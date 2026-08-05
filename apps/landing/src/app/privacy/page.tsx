import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalH, LegalIntro, LegalLi, LegalP, LegalShell } from '@/components/legal-shell'

export const metadata: Metadata = {
  title: 'Privacy Policy — Kendrix',
  description: 'What Kendrix collects while you use it, why, and the controls you have.',
}

export default function PrivacyPage() {
  return (
    <LegalShell
      active="Privacy"
      title="Privacy Policy"
      stamp="LAST UPDATED · AUG 2026 · INVITE-ONLY BETA"
    >
      <LegalIntro>
        Kendrix is an invite-only vertical-video studio. This policy explains what we collect while
        you use it, why, and the controls you have. Plain language first; the detail follows.
      </LegalIntro>

      <LegalH>What we collect</LegalH>
      <LegalLi>Account basics — your name, email, and how you signed in (password or Google).</LegalLi>
      <LegalLi>
        What you create — channel briefs, scripts, storyboards, generated reels, and the settings
        behind them.
      </LegalLi>
      <LegalLi>
        Usage &amp; billing signals — render counts and per-render spend, so budgets and the studio
        cap can work.
      </LegalLi>
      <LegalLi>
        Technical logs — device, browser and IP, kept briefly to keep the service secure and
        reliable.
      </LegalLi>

      <LegalH>How we use it</LegalH>
      <LegalLi>
        To run the studio — produce your reels, save drafts, and show costs before you spend.
      </LegalLi>
      <LegalLi>To keep your account secure and enforce the beta&rsquo;s usage limits.</LegalLi>
      <LegalLi>
        To improve the product in aggregate. We do <strong className="text-night-lit">not</strong>{' '}
        sell your data or train public models on your private content.
      </LegalLi>

      <LegalH>Third parties</LegalH>
      <LegalP>
        We rely on infrastructure and AI providers to generate and deliver video. They process
        content only to perform that work, under contract. When you publish to TikTok, YouTube or
        Instagram, their own terms and privacy policies apply to what you post there.
      </LegalP>

      <LegalH>Your content is yours</LegalH>
      <LegalP>
        You own the reels Kendrix produces for you. You can export them, and you can delete a
        channel or your account at any time — deletion removes your drafts and generated media from
        active systems, with backups aging out on a rolling schedule.
      </LegalP>

      <LegalH>Your controls</LegalH>
      <LegalLi>Access or export the data tied to your account.</LegalLi>
      <LegalLi>Correct your account details in settings.</LegalLi>
      <LegalLi>Delete a channel, or your whole account, whenever you like.</LegalLi>

      <LegalH>Contact</LegalH>
      <LegalP>
        Questions about privacy? Reach us at{' '}
        <a href="mailto:privacy@kendrix.io">privacy@kendrix.io</a>, or via the{' '}
        <Link href="/contact">contact page</Link>. We answer every message during the beta.
      </LegalP>
    </LegalShell>
  )
}
