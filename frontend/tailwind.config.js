// couleurs en variables CSS (canaux RGB, pour garder les opacités type bg-white/70) :
// valeurs claires et sombres dans src/index.css, selon le réglage de l'iPhone
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const pastel = (name) => ({ DEFAULT: c(name), soft: c(`${name}-soft`), deep: c(`${name}-deep`) });

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // « white » = surface des blocs (gris foncé en mode sombre)
        white: c("white"),
        lavender: pastel("lavender"),
        rose: pastel("rose"),
        peach: pastel("peach"),
        mint: pastel("mint"),
        sky: pastel("sky"),
        lemon: pastel("lemon"),
        cream: c("cream"),
        ink: { DEFAULT: c("ink"), soft: c("ink-soft") },
      },
      fontFamily: { sans: ["Nunito", "system-ui", "sans-serif"] },
      boxShadow: { soft: "var(--shadow-soft)" },
    },
  },
  plugins: [],
};
