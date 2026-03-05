// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: false,
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: {
          DEFAULT: 'rgb(var(--color-ivory))',
          deep:    'rgb(var(--color-ivory-deep))',
          border:  'rgb(var(--color-ivory-border))',
        },
        teal: {
          DEFAULT: 'rgb(var(--color-teal))',
          light:   'rgb(var(--color-teal-light))',
          muted:   'rgb(var(--color-teal-muted))',
        },
        warm: {
          900: 'rgb(var(--color-warm-900))',
          700: 'rgb(var(--color-warm-700))',
          500: 'rgb(var(--color-warm-500))',
          300: 'rgb(var(--color-warm-300))',
        },
        status: {
          stable:      'rgb(var(--color-stable))',
          monitor:     'rgb(var(--color-monitor))',
          notable:     'rgb(var(--color-notable))',
          significant: 'rgb(var(--color-significant))',
        },
        // shadcn semantic names
        background:  'rgb(var(--background))',
        foreground:  'rgb(var(--foreground))',
        primary: {
          DEFAULT:    'rgb(var(--primary))',
          foreground: 'rgb(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'rgb(var(--secondary))',
          foreground: 'rgb(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'rgb(var(--muted))',
          foreground: 'rgb(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'rgb(var(--accent))',
          foreground: 'rgb(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'rgb(var(--destructive))',
          foreground: 'rgb(var(--destructive-foreground))',
        },
        border:  'rgb(var(--border))',
        input:   'rgb(var(--input))',
        ring:    'rgb(var(--ring))',
        card: {
          DEFAULT:    'rgb(var(--card))',
          foreground: 'rgb(var(--card-foreground))',
        },
      },
      fontFamily: {
        display: 'var(--font-display)',
        body:    'var(--font-body)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card:     'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config