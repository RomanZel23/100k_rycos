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
          DEFAULT: '#ED1C24',
          50: '#FDF2F2',
          100: '#FDE8E8',
          200: '#FBD5D5',
          500: '#ED1C24',
          600: '#CC161D',
          700: '#990E14',
          text: '#ffffff',
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
