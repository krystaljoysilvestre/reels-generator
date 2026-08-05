import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalH, LegalIntro, LegalLi, LegalP, LegalShell } from '@/components/legal-shell'

export const metadata: Metadata = {
  title: 'Terms of Service — Kendrix',
  description: 'The terms for using Kendrix during its invite-only beta.',
}

export default function TermsPage() {
  return (
    <LegalShell
      active="Terms"
      title="Terms of Service"
      stamp="LAST UPDATED · AUG 2026 · INVITE-ONLY BETA"
    >
      <LegalIntro>
        By using Kendrix during its invite-only beta, you agree to these terms. They&rsquo;re meant
        to be readable — the short version is: create freely, own your work, don&rsquo;t abuse the
        tools.
      </LegalIntro>

      <LegalH>The beta</LegalH>
      <LegalP>
        Kendrix is early software offered to invited operators. Features may change, break, or move
        behind a plan later. It&rsquo;s free while the beta lasts; we&rsquo;ll give notice before
        that changes.
      </LegalP>

      <LegalH>Your account</LegalH>
      <LegalLi>Access is invite-only and personal — keep your credentials to yourself.</LegalLi>
      <LegalLi>
        You&rsquo;re responsible for activity under your account and the content you generate and
        publish.
      </LegalLi>
      <LegalLi>We may suspend accounts that abuse the service or break these terms.</LegalLi>

      <LegalH>Your content &amp; ownership</LegalH>
      <LegalP>
        You own the channels, scripts and reels you create. You grant Kendrix only the permissions
        needed to generate, store and deliver them to you. You&rsquo;re responsible for having the
        rights to anything you upload as a reference, and for what you choose to publish.
      </LegalP>

      <LegalH>Acceptable use</LegalH>
      <LegalLi>
        No illegal content, harassment, impersonation, or content that violates a platform&rsquo;s
        rules.
      </LegalLi>
      <LegalLi>No attempts to reverse-engineer, overload, or resell the service.</LegalLi>
      <LegalLi>Respect the usage limits and studio budget cap that keep the beta fair.</LegalLi>

      <LegalH>Costs &amp; billing</LegalH>
      <LegalP>
        Every render shows its estimated spend before you commit, with per-channel budgets and a
        studio-wide cap. During the beta these track usage without charge; paid plans, if
        introduced, will be announced with clear pricing first.
      </LegalP>

      <LegalH>Disclaimers</LegalH>
      <LegalP>
        The service is provided &ldquo;as is&rdquo; during the beta. AI output can be imperfect —
        review before publishing. To the extent the law allows, Kendrix isn&rsquo;t liable for
        indirect or consequential damages arising from use of the beta.
      </LegalP>

      <LegalH>Changes</LegalH>
      <LegalP>
        We may update these terms as the product evolves and will flag material changes. Continued
        use after an update means you accept it. Questions? See the{' '}
        <Link href="/contact">contact page</Link>.
      </LegalP>
    </LegalShell>
  )
}
