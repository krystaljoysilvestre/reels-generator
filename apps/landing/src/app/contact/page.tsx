import type { Metadata } from 'next'
import { ContactForm } from '@/components/contact-form'
import { LegalShell } from '@/components/legal-shell'

export const metadata: Metadata = {
  title: 'Contact — Kendrix',
  description: 'Reach the Kendrix studio — we read every message and reply within a day.',
}

function LaneCard({
  href,
  gradient,
  icon,
  title,
  detail,
}: {
  href?: string
  gradient: string
  icon: React.ReactNode
  title: string
  detail: string
}) {
  const body = (
    <>
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: gradient }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-sm font-700 text-night-ink">{title}</span>
        <span className="mono mt-0.5 block text-xs text-night-muted">{detail}</span>
      </span>
    </>
  )
  const frame =
    'flex items-center gap-[13px] rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-[15px]'
  return href ? (
    <a href={href} className={`${frame} !text-inherit transition-colors hover:border-white/25`}>
      {body}
    </a>
  ) : (
    <div className={frame}>{body}</div>
  )
}

export default function ContactPage() {
  return (
    <LegalShell active="Contact" title="Contact us" stamp="WE READ EVERY MESSAGE · BETA" wide>
      <div className="grid items-start gap-[22px] md:grid-cols-2">
        <div>
          <p className="text-base leading-[1.72] text-night-soft">
            We&rsquo;re a small studio and we read everything. Pick the fastest lane, or send the
            form — we reply within a day during the beta.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <LaneCard
              href="mailto:hello@kendrix.io"
              gradient="linear-gradient(135deg,#2FA4FF,#9B3BFF)"
              title="General & support"
              detail="hello@kendrix.io"
              icon={
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              }
            />
            <LaneCard
              href="mailto:privacy@kendrix.io"
              gradient="linear-gradient(135deg,#9B3BFF,#FF2D9B)"
              title="Privacy & legal"
              detail="privacy@kendrix.io"
              icon={
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6z" />
                </svg>
              }
            />
            {/* No community server exists yet — keep this lane honest until one opens. */}
            <LaneCard
              gradient="linear-gradient(135deg,#FF2D9B,#FF9A3D)"
              title="Community"
              detail="Beta Discord — opening soon"
              icon={
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v12H5.2L4 17.2z" />
                </svg>
              }
            />
          </div>
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[rgba(67,192,138,0.28)] bg-[rgba(67,192,138,0.06)] px-[15px] py-[13px]">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-mint" />
            <span className="mono text-xs text-[#9FE7C0]">
              Typical reply time — under 24h during beta
            </span>
          </div>
        </div>

        <div className="relative rounded-[20px] border border-white/[0.12] bg-white/[0.03] p-[26px]">
          <span className="crop tl" />
          <span className="crop tr" />
          <span className="crop bl" />
          <span className="crop br" />
          <h3 className="text-[19px] font-800 tracking-[-0.01em]">Send a message</h3>
          <ContactForm />
        </div>
      </div>
    </LegalShell>
  )
}
