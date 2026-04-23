/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0d14',
          surface: '#111520',
          elevated: '#161b28',
          border: '#1f2533',
        },
        accent: {
          DEFAULT: '#2563ff',
          hover: '#3b74ff',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        display: ['Syne', 'ui-sans-serif', 'system-ui'],
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -8px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
