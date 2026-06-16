import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Surfaces
        bg: '#FBFBFC',          // app canvas — barely-off white
        surface: '#FFFFFF',     // cards, panels
        subtle: '#F4F4F6',      // hover / inset fills
        // Hairlines
        border: '#EBEBEF',
        'border-strong': '#DEDEE3',
        // Text
        ink: '#16161A',         // primary
        muted: '#6B6B76',       // secondary
        faint: '#9B9BA4',       // tertiary / placeholders
        // Accent (Linear-ish indigo)
        accent: '#5E6AD2',
        'accent-hover': '#4E59C0',
        'accent-soft': '#EEF0FB',
        // Semantic
        positive: '#1A7F52',
        'positive-soft': '#E6F4EC',
        warning: '#9A6B12',
        'warning-soft': '#FBF1DD',
        info: '#2B5BD7',
        'info-soft': '#E9EFFD',
        danger: '#C8341B',
        'danger-soft': '#FBEAE6',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(16, 16, 26, 0.04)',
        sm: '0 1px 3px 0 rgba(16, 16, 26, 0.06), 0 1px 2px -1px rgba(16, 16, 26, 0.05)',
        md: '0 4px 12px -2px rgba(16, 16, 26, 0.08), 0 2px 6px -2px rgba(16, 16, 26, 0.05)',
        lg: '0 12px 32px -8px rgba(16, 16, 26, 0.14), 0 4px 12px -4px rgba(16, 16, 26, 0.08)',
      },
    },
  },
} satisfies Config
