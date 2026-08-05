import { CropMarks } from './crop-marks'
import { AlertIcon, ChartIcon, CheckIcon, MicIcon } from './icons'

export function FeatureSplit() {
  return (
    <section className="relative z-[2] mx-auto max-w-[1220px] px-6 py-[70px] sm:px-8">
      <div className="grid gap-[22px] lg:grid-cols-[1.3fr_1fr]">
        {/* A studio that judges its own work */}
        <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(160deg,rgba(155,59,255,0.14),rgba(47,164,255,0.05))] p-[38px]">
          <CropMarks />
          <div className="absolute -right-[50px] -top-[50px] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(255,45,155,0.3),transparent_70%)]" />
          <div className="relative">
            <h3 className="max-w-[380px] text-[30px] font-800 leading-[1.1] tracking-[-0.02em]">
              A studio that judges its own work.
            </h3>
            <p className="mt-[15px] max-w-[400px] text-[15px] leading-[1.65] text-night-soft">
              A read-gate on every story and a finishing pass on every cut, flagging continuity and
              clarity — so what reaches your queue is already good.
            </p>
            <div className="mt-6 flex max-w-[380px] flex-col gap-2.5">
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/[0.28] px-3.5 py-3">
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-[linear-gradient(135deg,#9B3BFF,#FF2D9B)]">
                  <CheckIcon size={13} stroke="#fff" strokeWidth={2.4} />
                </span>
                <span className="text-[13px] text-night-lit">
                  Passed the read — after one rewrite
                </span>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/[0.28] px-3.5 py-3">
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border border-[rgba(255,154,61,0.4)] bg-[rgba(255,154,61,0.2)]">
                  <AlertIcon size={12} stroke="#FF9A3D" strokeWidth={2.2} />
                </span>
                <span className="text-[13px] text-night-lit">
                  2 notes worth a look before approve
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[22px]">
          {/* Consistent voice & world */}
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-[26px]">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2FA4FF,#9B3BFF)]">
              <MicIcon size={21} stroke="#fff" />
            </div>
            <h3 className="text-xl font-800">Consistent voice &amp; world</h3>
            <p className="mt-[7px] text-sm leading-[1.55] text-night-muted">
              A story bible keeps characters and world details on-model from first frame to last.
            </p>
          </div>
          {/* Costs you can see */}
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-[26px]">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#FF2D9B,#FF9A3D)]">
              <ChartIcon size={21} stroke="#fff" />
            </div>
            <h3 className="text-xl font-800">Costs you can see</h3>
            <p className="mt-[7px] text-sm leading-[1.55] text-night-muted">
              Every render shows its spend up front, with budgets and a studio cap.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
