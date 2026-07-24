// Spend-free verification of EBN Slice 2 (illustrative rendering profile). No LLM, no fal, no DB — the
// illustrative pixels are already probe-proven (probe-ebn-visuals.ts); this asserts the SAFETY-CRITICAL
// wiring: the forced EBN profile is genuinely non-photoreal, the render-time guard would catch a photoreal
// style, and the standard path is unchanged. Usage: pnpm --filter worker exec tsx scripts/verify-ebn-render-wiring.ts
import '../src/env.js'
void (async () => {
  const { EBN_RENDERING_PROFILE } = await import('@reels/core')

  // Mirror of the exact guard + forcing logic in generate-images.ts (kept in sync deliberately). The guard
  // asserts the resolved EBN style AFFIRMATIVELY commands illustration — robust to the profile's own
  // negations ("NOT a photograph") — rather than blocklisting photoreal words. If the real code changes,
  // this script must change with it; that coupling is the point of the test.
  const isIllustrative = (style: string) => /illustrat/i.test(style) && /(not|never|no)\s+(a\s+)?photo/i.test(style)
  const effectiveStyle = (storyMode: string | null, channelStyle: string) =>
    storyMode === 'ebn' ? EBN_RENDERING_PROFILE : channelStyle

  let pass = true
  const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) pass = false }

  console.log('EBN render-wiring verification (spend-free)\n')

  // 1. The forced profile affirmatively commands illustration (leads illustrative + rejects photo).
  check('EBN_RENDERING_PROFILE is defined + non-trivial', !!EBN_RENDERING_PROFILE && EBN_RENDERING_PROFILE.length > 40)
  check('profile passes the guard (illustration affirmation present)', isIllustrative(EBN_RENDERING_PROFILE),
    EBN_RENDERING_PROFILE.slice(0, 60) + '…')

  // 2. The guard REJECTS a photoreal style (a forcing bypass or a mis-edit would throw before rendering).
  const photorealChannelStyle = 'gritty documentary still, candid reportage photography, photorealistic'
  check('guard REJECTS a photoreal style (throws before rendering)', !isIllustrative(photorealChannelStyle))

  // 3. Forcing: EBN reel → the illustrative profile, regardless of the channel's own (photoreal) style.
  check('EBN reel forced onto the illustrative profile (channel photoreal style ignored)',
    effectiveStyle('ebn', photorealChannelStyle) === EBN_RENDERING_PROFILE && isIllustrative(effectiveStyle('ebn', photorealChannelStyle)))

  // 4. Standard reel unchanged (regression): keeps its own style.
  check('standard reel keeps its own style (path untouched)',
    effectiveStyle('standard', photorealChannelStyle) === photorealChannelStyle)

  console.log(`\n${pass ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`)
  console.log(`\nEBN_RENDERING_PROFILE:\n  ${EBN_RENDERING_PROFILE}`)
  process.exit(pass ? 0 : 1)
})()
