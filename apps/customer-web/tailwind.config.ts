import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'color-mix(in srgb, var(--brand-color, #f97316) 12%, white)',
          100: 'color-mix(in srgb, var(--brand-color, #f97316) 24%, white)',
          500: 'var(--brand-color, #f97316)',
          600: 'color-mix(in srgb, var(--brand-color, #f97316) 85%, black)',
          700: 'color-mix(in srgb, var(--brand-color, #f97316) 70%, black)',
          text: 'var(--brand-text, #ffffff)',
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
        rycos: {
          red: '#ED1C24',
          'red-hover': '#CC161D',
          'red-light': '#FDF2F2',
          'red-border': '#FBD5D5',
          blue: '#002633',
          lightblue: '#4DBFF5',
        },
      },
      fontFamily: {
        sans: ["'Exo 2'", 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ["'Exo 2'", 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
