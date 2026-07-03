/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Xanh dương lấy từ quả địa cầu trong logo Gia Phát Group
        nm: {
          DEFAULT: "#0ea5e9",
          hover: "#0284c7",
          light: "#f0f9ff",
          dark: "#0c4a6b",
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6b",
        },
        // Vàng ánh kim lấy từ dải ruy băng/lá trong logo, dùng làm điểm nhấn phụ
        gold: {
          DEFAULT: "#d4a017",
          50: "#fffbeb",
          100: "#fdecc8",
          200: "#fbda95",
          300: "#f5c451",
          400: "#e8b023",
          500: "#d4a017",
          600: "#b8860b",
          700: "#8a6508",
          800: "#6b4e06",
          900: "#4a3604",
        },
      },
      fontFamily: {
        sans: ["Be Vietnam Pro", "sans-serif"],
        display: ["Syne", "sans-serif"],
        // giữ font-lobster cho logo/brand nếu cần
        lobster: ["Syne", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        "nm-sm": "0 2px 8px 0 rgba(14,165,233,0.15)",
        "nm-md": "0 4px 16px 0 rgba(14,165,233,0.25)",
        "nm-lg": "0 8px 32px 0 rgba(14,165,233,0.35)",
        "card": "0 1px 3px 0 rgba(0,0,0,0.04), 0 4px 12px 0 rgba(0,0,0,0.06)",
        "card-dark": "0 1px 3px 0 rgba(0,0,0,0.2), 0 4px 12px 0 rgba(0,0,0,0.3)",
      },
      animation: {
        "fade-in": "fadeIn 0.35s ease-out forwards",
        "slide-up": "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "slide-down": "slideDown 0.25s ease-out forwards",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "spin-slow": "spin 2s linear infinite",
        "sheet-up": "sheetUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        sheetUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.92)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
