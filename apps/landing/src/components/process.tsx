import type { ReactNode } from 'react'
import { BoardIcon, FrameIcon, SendIcon, WandIcon } from './icons'

type Step = {
  n: string
  hue: string
  tint: string
  border: string
  icon: ReactNode
  title: string
  copy: string
}

const STEPS: Step[] = [
  {
    n: '01',
    hue: '#2FA4FF',
    tint: 'rgba(47,164,255,0.14)',
    border: 'rgba(47,164,255,0.3)',
    icon: <WandIcon size={20} stroke="#2FA4FF" strokeWidth={1.7} />,
    title: 'Describe',
    copy: 'An idea becomes a story with a hook — self-graded before you see it.',
  },
  {
    n: '02',
    hue: '#9B3BFF',
    tint: 'rgba(155,59,255,0.14)',
    border: 'rgba(155,59,255,0.3)',
    icon: <BoardIcon size={20} stroke="#9B3BFF" strokeWidth={1.7} />,
    title: 'Storyboard',
    copy: 'Scenes on a cutting-room timeline. Reshoot or steer any frame.',
  },
  {
    n: '03',
    hue: '#FF2D9B',
    tint: 'rgba(255,45,155,0.14)',
    border: 'rgba(255,45,155,0.3)',
    icon: <FrameIcon size={20} stroke="#FF2D9B" strokeWidth={1.7} />,
    title: 'Render',
    copy: 'Visuals, motion, voice and music assemble into a finished cut — while you’re on to the next idea.',
  },
  {
    n: '04',
    hue: '#FF9A3D',
    tint: 'rgba(255,154,61,0.14)',
    border: 'rgba(255,154,61,0.3)',
    icon: <SendIcon size={20} stroke="#FF9A3D" strokeWidth={1.7} />,
    title: 'Publish',
    copy: 'Publishes to YouTube on your schedule — after you approve. TikTok and Reels are on the slate.',
  },
]

export function Process() {
  return (
    <section id="how" className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-10 pt-20 sm:px-8">
      <div className="mb-11 text-center">
        <div className="eyebrow">The process</div>
        <h2 className="mt-3 text-[34px] font-800 tracking-[-0.03em] sm:text-[44px]">
          Four takes, one master.
        </h2>
      </div>
      <div className="grid gap-0 max-lg:gap-4 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className={`kx-step border border-white/10 p-[26px_22px] max-lg:rounded-2xl ${
              i < STEPS.length - 1 ? 'lg:border-r-0' : ''
            } ${i === 0 ? 'lg:rounded-l-2xl' : ''} ${i === STEPS.length - 1 ? 'lg:rounded-r-2xl' : ''}`}
          >
            <div className="mb-4 flex items-center gap-2.5">
              <span className="mono text-[13px]" style={{ color: step.hue }}>
                {step.n}
              </span>
              <span
                className="h-px flex-1"
                style={{ background: `linear-gradient(90deg, ${step.hue}, transparent)` }}
              />
            </div>
            <div
              className="mb-3.5 flex h-[42px] w-[42px] items-center justify-center rounded-[11px] border"
              style={{ background: step.tint, borderColor: step.border }}
            >
              {step.icon}
            </div>
            <h3 className="text-[19px] font-800">{step.title}</h3>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-night-muted">{step.copy}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
