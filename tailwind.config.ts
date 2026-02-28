import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Tron theme tokens
        tron: {
          bg: '#06080f',
          surface: '#0c1021',
          'surface-light': '#121830',
          primary: '#00e5ff',
          'primary-dim': 'rgba(0,229,255,0.15)',
          success: '#34d399',
          'success-dim': 'rgba(52,211,153,0.15)',
          warning: '#fbbf24',
          'warning-dim': 'rgba(251,191,36,0.15)',
          muted: '#6b8aab',
          'muted-dim': 'rgba(107,138,171,0.12)',
          danger: '#fb7185',
          text: '#e2e8f0',
          'text-secondary': '#64748b',
          border: '#1e293b',
          grid: 'rgba(0,229,255,0.04)',
        },
        // Category accent colors
        'cat-push': '#F97316',
        'cat-pull': '#06B6D4',
        'cat-squat': '#D946EF',
        // shadcn compat
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0,229,255,0.3)',
        'glow-emerald': '0 0 20px rgba(52,211,153,0.3)',
        'glow-amber': '0 0 20px rgba(251,191,36,0.3)',
        'glow-push': '0 0 20px rgba(249,115,22,0.3)',
        'glow-pull': '0 0 20px rgba(6,182,212,0.3)',
        'glow-squat': '0 0 20px rgba(217,70,239,0.3)',
      },
      fontFamily: {
        display: ['Chakra Petch', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'glow-burst': {
          '0%': { boxShadow: '0 0 0px rgba(0,229,255,0)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 0 40px rgba(0,229,255,0.6)', transform: 'scale(1.05)' },
          '100%': { boxShadow: '0 0 20px rgba(0,229,255,0.3)', transform: 'scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'glow-burst': 'glow-burst 0.6s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
