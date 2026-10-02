/** @type {import('tailwindcss').Config} */
export default {
  content: { relative: true, files: ['./index.html', './src/**/*.{ts,tsx}'] },
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: { brand: { 50: '#fdf2f8', 100: '#fce7f3', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 900: '#831843' } },
    },
  },
  plugins: [],
}
