import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
        },
        ink: {
          100: '#E5E7EB',
          200: '#D1D5DB',
          300: '#9CA3AF',
          400: '#6B7280',
          500: '#4B5563',
          600: '#374151',
          700: '#1F2937',
          800: '#111827',
          900: '#0B0F19',
        },
      },
      boxShadow: {
        /* Glass card shadows */
        glass:         '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)',
        'glass-hover': '0 16px 48px rgba(0,0,0,0.55), 0 0 32px rgba(99,102,241,0.14), inset 0 1px 0 rgba(255,255,255,0.10)',
        /* Glow variants for stat cards */
        'glow-indigo': '0 0 32px rgba(99,102,241,0.30)',
        'glow-emerald':'0 0 32px rgba(16,185,129,0.25)',
        'glow-amber':  '0 0 32px rgba(245,158,11,0.25)',
        'glow-red':    '0 0 32px rgba(239,68,68,0.25)',
        /* Legacy */
        card:          '0 4px 24px rgba(0,0,0,0.35)',
        'card-hover':  '0 8px 32px rgba(0,0,0,0.48)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config;