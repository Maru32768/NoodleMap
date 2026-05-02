import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  build: {
    outDir: "build/client",
    target: "esnext",
  },
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    command === "serve" &&
      checker({
        typescript: true,
        eslint: {
          lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
          useFlatConfig: true,
        },
      }),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Maru's Noodle Map",
        short_name: "Noodle Map",
        description: "ラーメン・うどん店の個人マップ",
        theme_color: "#b54a3c",
        background_color: "#faf8f5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [{ find: "@", replacement: "/src" }],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8888",
        changeOrigin: true,
      },
    },
    allowedHosts: [".ngrok-free.app"],
  },
}));
