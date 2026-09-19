/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary — sampled from the AgriSmart logo's leaf/plant green
        // (logo.png, project root). See BRAND.md for the full token
        // documentation.
        brand: {
          50: '#eefdf5',
          100: '#d6f9e4',
          200: '#aef0cb',
          300: '#78e0ac',
          400: '#43c98a',
          500: '#22a86d',
          600: '#178a58',
          700: '#146d48',
          800: '#14563c',
          900: '#0d3d2b',
          950: '#062318',
        },
        // Accent — sampled from the logo's droplet-outline gradient and
        // circuit-node teal/cyan. Use this instead of Tailwind's default
        // "sky" blue anywhere an accent/info color is needed — the logo
        // has no blue, only green + teal.
        accent: {
          50: '#effdfc',
          100: '#d4f7f4',
          200: '#a9eee8',
          300: '#74dfd8',
          400: '#3fc9c2',
          500: '#17ada6',
          600: '#128f8a',
          700: '#0f726f',
          800: '#0e5c59',
          900: '#0b3f3d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)',
        cardHover: '0 2px 4px rgba(16,24,40,0.08), 0 6px 16px rgba(16,24,40,0.10)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
