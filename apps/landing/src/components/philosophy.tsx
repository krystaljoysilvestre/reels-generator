import Image from 'next/image'

export function Philosophy() {
  return (
    <section id="why" className="relative z-[2] mx-auto max-w-[1220px] px-6 py-[60px] sm:px-8">
      <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(165deg,rgba(155,59,255,0.08),rgba(47,164,255,0.03))] px-10 py-[70px] text-center">
        <Image
          src="/kendrix-k.png"
          alt=""
          width={340}
          height={340}
          className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[340px] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]"
        />
        <div className="kx-leak pointer-events-none absolute -bottom-40 -right-20 h-[400px] w-[520px] bg-[radial-gradient(circle,rgba(47,164,255,0.2),transparent_65%)]" />
        <div className="relative mx-auto max-w-[1000px]">
          <div className="mono text-xs uppercase tracking-[0.2em] text-night-lilac">
            Director&rsquo;s statement · why Kendrix exists
          </div>
          <h2 className="mx-auto mt-5 text-[28px] font-800 leading-[1.14] tracking-[-0.03em] [text-wrap:balance] sm:text-[40px]">
            The best ideas rarely lose to better ideas. They lose to the{' '}
            <span className="bg-[linear-gradient(110deg,#2FA4FF,#9B3BFF_45%,#FF2D9B_80%)] bg-clip-text text-transparent">
              hours in between
            </span>{' '}
            — the ones between a thought and a finished cut.
          </h2>
          <p className="mx-auto mt-6 max-w-[600px] text-base leading-[1.7] text-night-soft">
            Kendrix exists to close that gap. Not to replace taste — to give it a crew. You bring
            the idea and the judgment; the studio handles the thousand small crafts between a prompt
            and a publish button, and shows its work at every step so you always stay the director.
          </p>
          <div className="mt-7 inline-flex items-center gap-[11px]">
            <Image src="/kendrix-k.png" alt="" width={26} height={26} className="h-auto w-[26px]" />
            <span className="mono text-xs tracking-[0.1em] text-night-faint">
              — THE KENDRIX STUDIO
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
