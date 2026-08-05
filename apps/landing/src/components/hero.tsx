import Image from 'next/image'
import { CropMarks } from './crop-marks'
import { ArrowRightIcon, PlayIcon } from './icons'

export function Hero() {
  return (
    <section className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-[60px] pt-[70px] sm:px-8">
      {/* crop-marked frame around the hero */}
      <div className="relative grid items-center gap-[52px] p-3.5 lg:grid-cols-[1.15fr_0.85fr]">
        <CropMarks />

        <div>
          <div className="mono text-xs uppercase tracking-[0.16em] text-night-eyebrow">
            A storytelling studio · №01
          </div>
          <h1 className="mt-5 text-[46px] font-800 leading-[0.95] tracking-[-0.04em] sm:text-[60px] lg:text-[72px]">
            Roll a single idea.
            <br />
            Cut a{' '}
            {/* inline-block with side padding + its own taller line box so the
                gradient clip trims neither the italic glyph nor its descenders,
                without loosening the title-card lockup */}
            <span className="inline-block bg-[linear-gradient(110deg,#2FA4FF,#9B3BFF_44%,#FF2D9B_76%,#FF9A3D)] bg-clip-text px-[0.12em] py-[0.05em] italic leading-[1.15] text-transparent [font-weight:900]">
              finished&nbsp;reel
            </span>
            .
          </h1>
          <p className="mt-[26px] max-w-[470px] text-lg leading-[1.62] text-night-body">
            Kendrix writes, storyboards, shoots, scores and ships publish-ready vertical video — a
            full studio crew, with you in the director&rsquo;s chair.
          </p>
          <div className="mt-[34px] flex flex-wrap items-center gap-3.5">
            <a
              href="#access"
              className="kx-btn inline-flex items-center gap-[9px] rounded-[13px] bg-brand-3 px-[26px] py-[15px] text-base font-700 shadow-[0_14px_34px_-10px_rgba(255,45,155,0.55)]"
            >
              Request an invite <ArrowRightIcon size={17} strokeWidth={2.2} />
            </a>
            <a
              href="#feature"
              className="kx-btn kx-ghost inline-flex items-center gap-2.5 rounded-[13px] border border-white/[0.16] bg-white/[0.05] px-[22px] py-[15px] text-base font-600"
            >
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white/10">
                <PlayIcon />
              </span>
              See the cut
            </a>
          </div>
        </div>

        {/* cinematic reel still with slate + crop marks */}
        <div className="relative flex justify-center">
          <Image
            src="/kendrix-k.png"
            alt=""
            width={132}
            height={132}
            className="kx-float absolute left-[-2%] top-[-8%] z-[1] h-auto w-[132px] opacity-[0.92] [filter:drop-shadow(0_20px_56px_rgba(155,59,255,0.6))]"
          />
          <figure className="relative z-[2] m-0 w-[270px]">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[20px] border border-white/[0.14] bg-[linear-gradient(165deg,#1A0E2E,#4A1A5E_55%,#9B3BFF)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85),0_0_0_7px_rgba(255,255,255,0.03)]">
              <CropMarks />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.2),transparent_55%)]" />
              <div className="mono absolute left-3.5 top-3.5 rounded-[20px] bg-black/45 px-2.5 py-1 text-[10px] font-700 tracking-[0.06em] backdrop-blur-[6px]">
                SCENE 01 / 06
              </div>
              <div className="mono absolute right-3.5 top-3.5 rounded-[20px] bg-black/45 px-[9px] py-1 text-[10px] font-700 backdrop-blur-[6px]">
                00:12
              </div>
              <div className="absolute inset-x-0 bottom-[66px] px-[18px] text-center">
                {/* box-decoration-break keeps clean caption pills if the line ever wraps */}
                <span className="mono whitespace-nowrap rounded-md bg-black/[0.28] px-2.5 py-1.5 text-[13px] text-white [-webkit-box-decoration-break:clone] [box-decoration-break:clone] [text-shadow:0_2px_12px_rgba(0,0,0,0.7)]">
                  The first one came at 11:04.
                </span>
              </div>
              <div className="absolute inset-x-3.5 bottom-4">
                <div className="h-1 overflow-hidden rounded-[3px] bg-white/25">
                  <div className="h-full w-[34%] bg-[linear-gradient(90deg,#2FA4FF,#FF2D9B)]" />
                </div>
              </div>
            </div>
            <figcaption className="mono mt-[11px] flex justify-between text-[10.5px] uppercase tracking-[0.08em] text-night-ghost">
              <span>&ldquo;The Last Voicemail&rdquo;</span>
              <span>Midnight Tales</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
