import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Ajayi Shoot Tracker",
        short_name: "Shoots",
        theme_color: "#0a0a0f",
        icons: [],
      },
    }),
  ],
});