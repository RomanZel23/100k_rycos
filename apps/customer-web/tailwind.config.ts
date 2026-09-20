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
        // Runtime-themable: values come from CSS variables (defaults in globals.css,
        // per-brand values set by lib/brandTheme.ts from the brand's saved colors).
        brand: {
          DEFAULT: 'rgb(var(--brand-500) / <alpha-value>)',
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          text: 'rgb(var(--brand-text) / <alpha-value>)',
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
