import { CropMarks } from './crop-marks'
import { AccessForm } from './access-form'

export function Access() {
  return (
    <section id="access" className="relative z-[2] mx-auto max-w-[1220px] px-6 pb-20 pt-5 sm:px-8">
      <div className="relative overflow-hidden rounded-[28px] border border-white/[0.12] bg-[linear-gradient(150deg,#140B26,#2A1250_55%,#3D1240)] px-6 py-[66px] text-center sm:px-11">
        <CropMarks />
        <div className="kx-leak pointer-events-none absolute -top-[130px] left-1/2 h-[430px] w-[660px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(255,45,155,0.34),transparent_65%)]" />
        <div className="relative">
          <div className="mono text-xs uppercase tracking-[0.2em] text-night-lilac">
            That&rsquo;s a wrap · roll yours
          </div>
          <h2 className="mt-4 text-[36px] font-800 leading-none tracking-[-0.035em] sm:text-[52px]">
            Get on the call sheet.
          </h2>
          <p className="mx-auto mt-4 max-w-[430px] text-base leading-[1.6] text-night-soft">
            Kendrix is in production — we&rsquo;re proving it on our own channels first, in the
            open. Ask for a seat and you&rsquo;ll be first through the door when invites open.
          </p>
          <div className="mt-[30px] flex flex-wrap justify-center gap-3">
            <AccessForm />
          </div>
          <div className="mono mt-4 text-[11.5px] tracking-[0.08em] text-night-faint">
            EARLY SEATS ARE FREE · NO CARD, EVER, DURING TESTING
          </div>
        </div>
      </div>
    </section>
  )
}
