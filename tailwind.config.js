/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables so the accent color can be switched at runtime.
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
          950: "rgb(var(--brand-950) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)",
        // Soft, layered elevation for premium glass surfaces.
        soft: "0 4px 16px -4px rgba(16,24,40,.08), 0 8px 32px -8px rgba(16,24,40,.10)",
        lift: "0 12px 32px -8px rgba(16,24,40,.16), 0 4px 12px -4px rgba(16,24,40,.08)",
        glass: "0 8px 32px -8px rgba(16,24,40,.18), inset 0 1px 0 0 rgba(255,255,255,.4)",
        // Accent-tinted glow, driven by the runtime brand color.
        glow: "0 0 0 1px rgb(var(--brand-500) / .15), 0 8px 28px -6px rgb(var(--brand-500) / .45)",
        "glow-sm": "0 4px 14px -4px rgb(var(--brand-500) / .40)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "sheet-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--brand-500) / .35)" },
          "50%": { boxShadow: "0 0 0 6px rgb(var(--brand-500) / 0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up .5s cubic-bezier(.22,1,.36,1) both",
        "fade-in": "fade-in .4s ease both",
        "scale-in": "scale-in .35s cubic-bezier(.22,1,.36,1) both",
        "sheet-up": "sheet-up .4s cubic-bezier(.22,1,.36,1)",
        "slide-in-left": "slide-in-left .35s cubic-bezier(.22,1,.36,1)",
        shimmer: "shimmer 1.6s infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
