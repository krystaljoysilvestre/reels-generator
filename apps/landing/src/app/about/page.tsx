import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalH, LegalIntro, LegalLi, LegalP, LegalShell } from '@/components/legal-shell'
import { ENTITY_DESCRIPTION, META_DESCRIPTION } from '@/lib/site'
import { landingAccess } from '@/lib/access'

export const metadata: Metadata = {
  title: 'About — Kendrix',
  description: META_DESCRIPTION,
}

/**
 * The entity page — where a person or a machine lands to answer "what is Kendrix" plainly. Content
 * is quoted faithfully from dna/START-HERE.md and dna/company/ideal-customer.md rather than
 * paraphrased, so this page can't drift from the product's own stated definition of itself.
 */
export default function AboutPage() {
  const { open, signupUrl } = landingAccess()
  return (
    <LegalShell
      active="About"
      eyebrow="About Kendrix"
      title="What is Kendrix?"
      stamp="STORYTELLING OPERATING SYSTEM · EARLY ACCESS"
    >
      <LegalIntro>{ENTITY_DESCRIPTION}</LegalIntro>

      <LegalH>What Kendrix is not</LegalH>
      <LegalLi>Not an AI chatbot.</LegalLi>
      <LegalLi>Not an AI prompt wrapper.</LegalLi>
      <LegalLi>
        Not an AI video generator — Kendrix produces video, but the video is the output of a
        storytelling workflow, not the product’s identity.
      </LegalLi>
      <LegalLi>Not a collection of disconnected AI tools.</LegalLi>
      <LegalLi>Not a template library.</LegalLi>

      <LegalH>Who Kendrix is for</LegalH>
      <LegalP>
        Independent creators making story-driven video — horror, children’s stories, history and
        documentary, education, and other narrative genres — who publish consistently and want to
        stay in creative control. Kendrix is designed around one person doing the whole job, not a
        production team.
      </LegalP>

      <LegalH>How it works</LegalH>
      <LegalP>
        One idea becomes a story with a hook, graded before you ever see it. Scenes lay out on a
        storyboard you can reshoot or steer. Visuals, motion, voice and music assemble into a
        finished cut. It publishes to YouTube on your schedule, after you approve it — TikTok and
        Reels publishing are next.
      </LegalP>

      <LegalH>Where Kendrix is today</LegalH>
      <LegalP>
        {open
          ? 'Kendrix is open for free early access while we keep improving the storytelling workflow. Create an account, set up your channel and make your first reel. Production limits apply, and no payment card is required.'
          : 'Kendrix is in development, with its own channels as the first customer. Early access is free, and we are welcoming creators by invitation while we improve the workflow.'}
      </LegalP>
      <LegalP>
        {open ? <a href={signupUrl}>Create your account</a> : <>Request access from the <Link href="/#access">homepage</Link></>}, or see the{' '}
        <Link href="/#faq">FAQ</Link> for more on pricing, ownership and how Kendrix handles
        YouTube’s content policies.
      </LegalP>
    </LegalShell>
  )
}
