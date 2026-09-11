import type { Config } from 'tailwindcss'

// Brand palette mirrors yalla-website (orange #FF8800) so the panel stays visually
// consistent with the marketing site.
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
