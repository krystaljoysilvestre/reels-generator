import type { ReactNode } from 'react'
import { CropMarks } from './crop-marks'
import {
  BoardIcon,
  CameraIcon,
  HeadphonesIcon,
  MicIcon,
  PenIcon,
  SendIcon,
} from './icons'

type Role = {
  icon: ReactNode
  tint: string // rgba backgrounds/borders per row
  border: string
  name: string
  time: string
}

const ROLES: Role[] = [
  {
    icon: <PenIcon stroke="#2FA4FF" />,
    tint: 'rgba(47,164,255,0.14)',
    border: 'rgba(47,164,255,0.3)',
    name: 'Writer',
    time: '~40 min',
  },
  {
    icon: <BoardIcon stroke="#9B3BFF" />,
    tint: 'rgba(155,59,255,0.14)',
    border: 'rgba(155,59,255,0.3)',
    name: 'Storyboard artist',
    time: '~30 min',
  },
  {
    icon: <MicIcon stroke="#FF2D9B" />,
    tint: 'rgba(255,45,155,0.14)',
    border: 'rgba(255,45,155,0.3)',
    name: 'Voice actor',
    time: '~20 min',
  },
  {
    icon: <CameraIcon stroke="#FF9A3D" />,
    tint: 'rgba(255,154,61,0.14)',
    border: 'rgba(255,154,61,0.3)',
    name: 'Editor',
    time: '~90 min',
  },
  {
    icon: <HeadphonesIcon stroke="#43C08A" />,
    tint: 'rgba(67,192,138,0.14)',
    border: 'rgba(67,192,138,0.3)',
    name: 'Sound designer',
    time: '~25 min',
  },
  {
    icon: <SendIcon stroke="#B8B0CC" />,
    tint: 'rgba(148,140,171,0.14)',
    border: 'rgba(148,140,171,0.3)',
    name: 'Publisher',
    time: '~15 min',
  },
]

export function Problem() {
  return (
    <section
      id="problem"
      className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-5 pt-20 sm:px-8"
    >
      <div className="grid items-center gap-[52px] lg:grid-cols-2">
        <div>
          <div className="eyebrow">The problem · call sheet</div>
          <h2 className="mt-3 text-[36px] font-800 leading-none tracking-[-0.03em] sm:text-[46px]">
            The whole crew
            <br />
            is you.
          </h2>
          <p className="mt-[22px] max-w-[450px] text-base leading-[1.65] text-night-body">
            Posting daily short video means being a writer, a storyboard artist, a voice actor, an
            editor, a sound designer and a publisher — every day, for every clip. Most channels die
            right there, buried under their own call sheet.
          </p>
          <p className="mt-4 max-w-[450px] text-base font-600 leading-[1.65] text-night-lit">
            Kendrix takes the whole sheet off your desk.
          </p>
        </div>

        {/* call sheet card */}
        <div className="relative overflow-hidden rounded-[18px] border border-white/[0.12] bg-white/[0.03]">
          <CropMarks />
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-black/[0.28] px-[18px] py-[15px]">
            <span className="mono text-[11px] tracking-[0.14em] text-night-faint">
              CALL SHEET — 1 REEL
            </span>
            <span className="mono kx-blink text-[11px] text-brand-pink">● SOLO</span>
          </div>
          <div className="px-2 py-1.5">
            {ROLES.map((role, i) => (
              <div
                key={role.name}
                className={`flex items-center gap-3 px-3 py-[11px] ${i > 0 ? 'border-t border-white/[0.05]' : ''}`}
              >
                <span
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg border"
                  style={{ background: role.tint, borderColor: role.border }}
                >
                  {role.icon}
                </span>
                <span className="flex-1 text-sm font-600 text-night-lit">{role.name}</span>
                <span className="mono text-xs text-night-dim">{role.time}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-white/10 bg-[linear-gradient(120deg,rgba(47,164,255,0.16),rgba(155,59,255,0.16)_50%,rgba(255,45,155,0.16))] px-5 py-[15px]">
            <span className="font-display text-sm font-800 text-white">With Kendrix</span>
            <span className="mono text-[13px] font-700 text-white">~10 min · review &amp; approve</span>
          </div>
        </div>
      </div>
    </section>
  )
}
