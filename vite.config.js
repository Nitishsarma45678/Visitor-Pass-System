import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  // allow Vite to be reachable from the network (needed for ngrok)
  server: {
    host: true,
    // Allow all ngrok subdomains (any-subdomain.ngrok-free.app).
    // If you get a specific ngrok host error, you can add that host explicitly here.
    allowedHosts: [".ngrok-free.app"]
  },

  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        id: "/",
        name: "CarePass",
        short_name: "CarePass",
        description: "Visitor Pass PWA — create passes, scan QR, check-in/out.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0ea5e9",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],

  resolve: { alias: { "@": path.resolve(__dirname, "src") } }
});
