/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lavender: { DEFAULT: "#C8B6FF", soft: "#EEE8FF", deep: "#7B61D9" },
        rose: { DEFAULT: "#FFC8DD", soft: "#FFEDF4", deep: "#D9567F" },
        peach: { DEFAULT: "#FFD6A5", soft: "#FFF1E0", deep: "#C9792A" },
        mint: { DEFAULT: "#B9FBC0", soft: "#E6FDE9", deep: "#2E9E52" },
        sky: { DEFAULT: "#A0C4FF", soft: "#E3EEFF", deep: "#3D6FC4" },
        lemon: { DEFAULT: "#FDFFB6", soft: "#FEFFE3", deep: "#A3A12A" },
        cream: "#FFFBF5",
        ink: { DEFAULT: "#3D3D4E", soft: "#8A8A9E" },
      },
      fontFamily: { sans: ["Nunito", "system-ui", "sans-serif"] },
      boxShadow: { soft: "0 4px 20px -6px rgba(61, 61, 78, 0.15)" },
    },
  },
  plugins: [],
};
