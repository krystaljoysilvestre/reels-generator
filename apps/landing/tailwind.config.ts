import type { Config } from 'tailwindcss'

/** The Kendrix brand gradient — blue → purple → pink → orange.
 *  Values mirror apps/web/tailwind.config.ts exactly (HANDOFF: don't fork new colors).
 *  4-stop (with the orange tail) is for hero taglines and long sweeps;
 *  3-stop is the workhorse for CTAs and accents. */
const BRAND_4 = 'linear-gradient(120deg, #2FA4FF 0%, #9B3BFF 45%, #FF2D9B 75%, #FF9A3D 100%)'
const BRAND_3 = 'linear-gradient(120deg, #2FA4FF 0%, #9B3BFF 45%, #FF2D9B 100%)'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontWeight: {
        '400': '400',
        '500': '500',
        '600': '600',
        '700': '700',
        '800': '800',
        '900': '900',
      },
      fontFamily: {
        sans: ['var(--font-mulish)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-nunito)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-space-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ── Brand gradient stops ──────────────────────────────
        brand: {
          blue: '#2FA4FF',
          violet: '#7B5BFF',
          purple: '#9B3BFF',
          pink: '#FF2D9B',
          orange: '#FF9A3D',
        },
        accent: '#9B3BFF',
        // ── The dark marketing world ──────────────────────────
        night: {
          DEFAULT: '#07060C', // page base
          ink: '#F4F1F7', //     primary text
          body: '#B8B0CC', //    body copy
          muted: '#948CAB', //   secondary
          faint: '#8A82A0', //   tertiary / slate captions
          dim: '#7C748F', //     timecodes, call-sheet minutes
          ghost: '#6E667E', //   meta strip, footer micro-copy
          lit: '#E4DEF0', //     lifted body text (call-sheet roles, checklist)
          soft: '#C9C2DA', //    philosophy body
          eyebrow: '#9B7BC8', // section eyebrows
          lilac: '#C9A0FF', //   bright eyebrows on plum panels
          orchid: '#D98BE8', //  "in the cut" label
        },
        mint: '#43C08A', // shipped / roadmap green
      },
      backgroundImage: {
        brand: BRAND_4,
        'brand-3': BRAND_3,
      },
    },
  },
  plugins: [],
} satisfies Config
