/**
 * The 21:9 letterboxed "screening room" still.
 * HANDOFF: swap the mock frame for a real product screenshot when available.
 */
export function FeaturedFrame() {
  return (
    <section
      id="feature"
      className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-[30px] pt-20 sm:px-8"
    >
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="eyebrow">The cut · featured frame</div>
          <h2 className="mt-3 text-[32px] font-800 tracking-[-0.03em] sm:text-[40px]">
            Screening room, built in.
          </h2>
        </div>
        <p className="max-w-[340px] text-[15px] leading-[1.6] text-night-muted">
          Preview every scene on a real stage — caption styling, timing and transport, exactly as
          it&rsquo;ll publish.
        </p>
      </div>

      {/* 21:9 letterboxed still */}
      <div className="relative aspect-video overflow-hidden rounded-[18px] border border-white/[0.12] bg-[linear-gradient(120deg,#160B28,#3A1250_52%,#5A1A46)] shadow-[0_40px_100px_-40px_rgba(155,59,255,0.4)] md:aspect-[21/9]">
        <div className="kx-leak absolute inset-0 bg-[radial-gradient(600px_300px_at_80%_10%,rgba(255,45,155,0.32),transparent_60%),radial-gradient(560px_320px_at_12%_100%,rgba(47,164,255,0.26),transparent_60%)]" />
        {/* letterbox bars */}
        <div className="absolute inset-x-0 top-0 h-[34px] bg-black" />
        <div className="absolute inset-x-0 bottom-0 flex h-[34px] items-center justify-between bg-black px-5">
          <span className="mono text-[11px] text-night-dim">▶ 00:12 / 01:18</span>
          <div className="relative mx-[18px] h-[3px] flex-1 overflow-hidden rounded-[3px] bg-white/[0.16]">
            <div className="h-full w-[28%] bg-[linear-gradient(90deg,#2FA4FF,#FF2D9B)]" />
          </div>
          <span className="mono text-[11px] text-night-dim">SCENE 01/06</span>
        </div>
        {/* centered caption */}
        <div className="absolute inset-x-0 inset-y-[34px] flex flex-col items-center justify-center px-6 text-center sm:px-10">
          <div className="mono hidden text-xs uppercase tracking-[0.2em] text-white/55 sm:block">
            Now playing
          </div>
          <div className="font-display text-[19px] font-900 tracking-[-0.02em] text-white [text-shadow:0_4px_30px_rgba(0,0,0,0.5)] sm:mt-3.5 sm:text-[34px] lg:text-[44px]">
            &ldquo;The first one came at 11:04.&rdquo;
          </div>
          <div className="mt-[18px] hidden gap-2 sm:inline-flex">
            {['FILM GRAIN', 'SLOW ZOOM', 'EERIE WHISPER'].map((tag) => (
              <span
                key={tag}
                className="mono rounded-[20px] border border-white/[0.16] bg-white/10 px-[11px] py-[5px] text-[11px] text-night-lit"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        {/* scan marker */}
        <div className="kx-scan absolute inset-y-[34px] w-[2px] bg-[linear-gradient(#2FA4FF,#FF2D9B)] opacity-50" />
      </div>
    </section>
  )
}
