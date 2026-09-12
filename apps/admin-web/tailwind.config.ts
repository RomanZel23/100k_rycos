import type { Config } from 'tailwindcss'

// SolutionsBay Brand palette (TechBay Red #ED1C24, TechBay Blue #002633, TechBay Light Blue #4DBFF5)
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ED1C24',
          50: '#FDF2F2',
          100: '#FDE8E8',
          200: '#FBD5D5',
          500: '#ED1C24',
          600: '#CC161D',
          700: '#990E14',
        },
        techbay: {
          blue: '#002633',
          'blue-dark': '#001A24',
          'blue-light': '#0B3A4C',
          lightblue: '#4DBFF5',
          'lightblue-hover': '#2CB5F5',
          red: '#ED1C24',
          darkred: '#820000',
          burgundy: '#3A000F',
        },
      },
      fontFamily: {
        sans: ["'Exo 2'", 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ["'Exo 2'", 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
