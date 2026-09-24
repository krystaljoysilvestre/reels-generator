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
      stamp="LAST UPDATED · SEP 2026 · EARLY ACCESS"
    >
      <LegalIntro>
        Kendrix is a storytelling studio in early access. This policy explains what we collect while
        you use it, why, and the controls you have. Plain language first; the detail follows.
      </LegalIntro>

      <LegalH>What we collect</LegalH>
      <LegalLi>Account basics — your name, email, and how you signed in (password or Google).</LegalLi>
      <LegalLi>Account security — a password hash for password accounts, email verification records, and recovery links stored as hashes.</LegalLi>
      <LegalLi>Messages you send us — contact-form details, access requests, and any channel description you choose to include.</LegalLi>
      <LegalLi>
        What you create — channel briefs, scripts, storyboards, generated reels, and the settings
        behind them.
      </LegalLi>
      <LegalLi>
        Production usage — reel counts and production spend, so budgets and the studio
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
      <LegalLi>To send requested account verification and password recovery emails, and respond to your messages.</LegalLi>
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
      <LegalP>
        We use an email delivery provider to send account verification and recovery messages.
        It processes your email address and the message content to deliver them. Our marketing
        website uses Google Analytics to measure visits; account pages in the studio do not load it.
      </LegalP>

      <LegalH>Your content is yours</LegalH>
      <LegalP>
        You own the reels Kendrix produces for you and can download finished reels from the studio.
        You can delete a channel from its settings. Account deletion and account-data requests
        are handled through our <Link href="/contact">contact page</Link>; they are not self-service
        actions in the studio. Stored media cleanup is handled separately from removing a channel.
      </LegalP>

      <LegalH>Your controls</LegalH>
      <LegalLi>Download finished reels in the studio. Contact us to request other data tied to your account.</LegalLi>
      <LegalLi>Update your display name from Account in the studio.</LegalLi>
      <LegalLi>Delete a channel in its settings, or contact us to request account deletion.</LegalLi>

      <LegalH>Contact</LegalH>
      <LegalP>
        Questions about privacy? Reach us at{' '}
        <a href="mailto:privacy@kendrix.io">privacy@kendrix.io</a>, or via the{' '}
        <Link href="/contact">contact page</Link>. We answer every message during the beta.
      </LegalP>
    </LegalShell>
  )
}
