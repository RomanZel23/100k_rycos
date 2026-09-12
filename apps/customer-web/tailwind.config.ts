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
      },
    },
  },
  plugins: [],
};

export default config;
