import type { Config } from 'tailwindcss'

// Brand palette for 100k-RYCOS (orange #FF8800)
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF8800',
          50: '#FFF4E5',
          100: '#FFE8CC',
          500: '#FF8800',
          600: '#E67A00',
          700: '#CC6D00',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
