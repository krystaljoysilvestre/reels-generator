import type { Config } from 'tailwindcss'

/** The Kendrix brand gradient — blue → purple → pink → orange.
 *  4-stop (with the orange tail) is for hero taglines and long sweeps;
 *  3-stop is the workhorse for CTAs, active states and avatars. */
const BRAND_4 = 'linear-gradient(120deg, #2FA4FF 0%, #9B3BFF 45%, #FF2D9B 75%, #FF9A3D 100%)'
const BRAND_3 = 'linear-gradient(120deg, #2FA4FF 0%, #9B3BFF 45%, #FF2D9B 100%)'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The design spec talks in numeric weights (Nunito 700/800/900,
      // Mulish 400/500/600/700), so expose them as font-400 … font-900.
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
      fontSize: {
        // micro-label (uppercase, tracked) — smaller than Tailwind's text-xs
        '2xs': ['10px', { lineHeight: '1.3' }],
      },
      colors: {
        // ── Surfaces ──────────────────────────────────────────
        bg: '#FBFAFF',              // app canvas (purple-tinted white)
        surface: '#FFFFFF',         // cards, sidebar, header
        subtle: '#FAF9FD',          // hover / light inset fills
        'subtle-strong': '#F0EDF8', // deeper insets, muted fills
        // ── Hairlines ─────────────────────────────────────────
        'border-soft': '#F2F0F8',   // faintest divider
        border: '#ECEAF3',          // default hairline
        'border-mid': '#E4E1EE',    // buttons
        'border-strong': '#DEDBEA', // inputs
        // ── Text ──────────────────────────────────────────────
        ink: '#16131F',             // primary
        body: '#2C2836',            // long-form body copy
        muted: '#6B6577',           // secondary
        faint: '#9B96A8',           // tertiary / placeholders
        'faint-soft': '#B0AABE',    // micro-labels
        // ── Accent (the gradient's purple, for single-colour use) ──
        accent: '#9B3BFF',
        'accent-hover': '#7A2BE0',  // link hover
        'accent-soft': '#F2ECFC',   // soft accent wash
        'accent-ring': '#C9A0FF',   // hover border on cards / chips / nav
        // ── Brand gradient stops (avatars, icon strokes, accent pairs) ──
        brand: {
          blue: '#2FA4FF',
          violet: '#7B5BFF',
          purple: '#9B3BFF',
          pink: '#FF2D9B',
          orange: '#FF9A3D',
        },
        // ── Dark world (auth panes + cutting-room stage) ──────
        night: {
          DEFAULT: '#08060E',
          800: '#0A0713',
          700: '#0D0A17',
          plum: '#1B1330',          // credits card / stage base
          'plum-lit': '#2A1650',    // credits card gradient end
          ink: '#FFFFFF',
          body: '#B8B0CC',
          muted: '#948CAB',
          faint: '#6A6280',
          // semantics legible on the dark panes
          danger: '#FF9C8A',
          success: '#43E08A',
          'success-body': '#9FE7C0',
          'success-strong': '#C6F5DD',
          'success-bg': 'rgba(38, 166, 105, 0.12)',
          'success-border': 'rgba(38, 166, 105, 0.32)',
        },
        // ── Semantic ──────────────────────────────────────────
        success: '#1A7F52',
        'success-soft': '#E6F4EC',
        warning: '#8A5A16',
        'warning-soft': 'rgba(255, 154, 61, 0.07)',
        'warning-ring': 'rgba(255, 154, 61, 0.28)',
        danger: '#C8341B',
        'danger-soft': '#FBEAE6',
        // `positive`/`negative` are the app's older names for success/danger and are
        // still used across the storyboard, admin and toasts — kept as aliases.
        positive: '#1A7F52',
        'positive-soft': '#E6F4EC',
        negative: '#C8341B',
        'negative-soft': '#FBEAE6',
        // status pills
        'status-pending': '#9B3BFF',
        'status-pending-soft': '#F2ECFC',
        'status-suspended': '#B0453A',
        'status-suspended-soft': '#F8ECEA',
        // row hover
        'row-hover': '#F7F5FC',
      },
      backgroundImage: {
        brand: BRAND_4,
        'brand-3': BRAND_3,
        // soft wash — the gradient at 6–12% alpha (active nav, "why" panel)
        'brand-wash':
          'linear-gradient(120deg, rgba(47,164,255,0.12), rgba(155,59,255,0.12) 45%, rgba(255,45,155,0.12))',
        'brand-wash-faint':
          'linear-gradient(120deg, rgba(47,164,255,0.06), rgba(155,59,255,0.08) 45%, rgba(255,45,155,0.06))',
        // vertical bar for the active nav row
        'brand-bar': 'linear-gradient(180deg, #2FA4FF, #FF2D9B)',
        // avatar / accent pairs
        'pair-purple-pink': 'linear-gradient(135deg, #9B3BFF, #FF2D9B)',
        'pair-blue-purple': 'linear-gradient(135deg, #2FA4FF, #9B3BFF)',
        'pair-blue-violet': 'linear-gradient(135deg, #2FA4FF, #7B5BFF)',
        'pair-pink-orange': 'linear-gradient(135deg, #FF2D9B, #FF9A3D)',
        // dark plum surfaces (credits card, channel banner)
        plum: 'linear-gradient(150deg, #1B1330, #2A1650)',
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '10px',   // inputs, small buttons
        md: '12px',   // buttons
        lg: '16px',   // cards
        xl: '18px',   // elevated cards
        '2xl': '20px', // pills, avatar tiles
        '3xl': '22px', // phone frame
      },
      boxShadow: {
        // Card resting state
        xs: '0 1px 3px rgba(20, 16, 26, 0.05)',
        // Card elevated states
        sm: '0 4px 16px rgba(30, 16, 60, 0.1)',
        md: '0 8px 24px rgba(30, 16, 60, 0.12)',
        lg: '0 12px 40px -6px rgba(30, 16, 60, 0.16)',
        // CTA glow (gradient buttons)
        'glow-sm': '0 6px 18px -6px rgba(155, 59, 255, 0.55)',
        'glow-md': '0 8px 24px -6px rgba(155, 59, 255, 0.5)',
        'glow-lg': '0 12px 30px -6px rgba(155, 59, 255, 0.55)',
        // pink-weighted hover glow used by the mocks' primary CTA
        'glow-pink': '0 16px 34px -10px rgba(255, 45, 155, 0.6)',
      },
      ringColor: {
        // focus ring: rgba(155,59,255,.16) light / .25 dark
        focus: 'rgba(155, 59, 255, 0.16)',
        'focus-dark': 'rgba(155, 59, 255, 0.25)',
      },
      letterSpacing: {
        micro: '0.12em',
        'micro-wide': '0.14em',
      },
      spacing: {
        sidebar: '236px',
      },
      animation: {
        'k-float': 'k-float 6s ease-in-out infinite',
        leak: 'leak 7s ease-in-out infinite',
        'stage-up': 'stage-up 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both',
        'ticker-fade': 'ticker-fade 3s ease-in-out infinite',
        'aura-pulse': 'aura-pulse 2.8s ease-in-out infinite',
        ring: 'ring 2s ease-out infinite',
        'glow-pan': 'glow-pan 6s ease-in-out infinite',
      },
      keyframes: {
        'k-float': {
          '0%, 100%': { transform: 'translateY(0) rotate(-3deg)' },
          '50%': { transform: 'translateY(-20px) rotate(3deg)' },
        },
        leak: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.85' },
          '50%': { transform: 'translate(-12px, 8px) scale(1.07)', opacity: '1' },
        },
        'stage-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'ticker-fade': {
          '0%, 18%': { opacity: '0', transform: 'translateY(4px)' },
          '25%, 92%': { opacity: '1', transform: 'none' },
          '100%': { opacity: '0', transform: 'translateY(-4px)' },
        },
        'aura-pulse': {
          '0%, 100%': { transform: 'scale(0.85)', opacity: '0.18' },
          '50%': { transform: 'scale(1.25)', opacity: '0.4' },
        },
        ring: {
          '0%': { transform: 'scale(0.5)', opacity: '0.5' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        'glow-pan': {
          '0%, 100%': { opacity: '0.75' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
} satisfies Config
