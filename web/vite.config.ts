import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  build: {
    outDir: "build/client",
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        admin: resolve(rootDir, "admin/index.html"),
      },
    },
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
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,wasm,css,png,svg,ico,webp,woff,woff2}"],
        navigateFallback: null,
      },
      includeAssets: [
        "favicon.png",
        "manifest.webmanifest",
        "admin-manifest.webmanifest",
        "pwa-192.png",
        "pwa-512.png",
        "admin-pwa-192.png",
        "admin-pwa-512.png",
      ],
      manifest: false,
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
