import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-180.png"],
      manifest: {
        name: "Maison",
        short_name: "Maison",
        description: "L'organisation de la maison, à deux",
        lang: "fr",
        theme_color: "#FFFBF5",
        background_color: "#FFFBF5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        // appui long sur l'icône de l'appli (Android, ordinateur ; pas sur iPhone)
        shortcuts: [
          { name: "Cartes de fidélité", short_name: "Cartes", url: "/cartes", icons: [{ src: "shortcut-cartes.png", sizes: "192x192", type: "image/png" }] },
          { name: "Liste de courses", short_name: "Courses", url: "/courses", icons: [{ src: "shortcut-courses.png", sizes: "192x192", type: "image/png" }] },
          { name: "On mange où ?", short_name: "On mange où ?", url: "/restos?hasard", icons: [{ src: "shortcut-hasard.png", sizes: "192x192", type: "image/png" }] },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // réception et clic des notifications push
        importScripts: ["push-sw.js"],
        // photos des cartes et produits gardées pour le hors-ligne, mises à jour en arrière-plan
        runtimeCaching: [
          {
            urlPattern: /\/api\/(cards|products)\/[^/]+\/image$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "images", expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
