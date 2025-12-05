// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#0ea5e9",
          dark: "#0284c7"
        }
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 6px 18px rgba(16,24,40,0.06)'
      }
    }
  },
  plugins: [],
};
