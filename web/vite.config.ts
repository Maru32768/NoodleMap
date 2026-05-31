import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import checker from "vite-plugin-checker";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = dirname(fileURLToPath(import.meta.url));
const basemapOrigin = "https://tiles.noodle-map.marulabs.dev";

const readDevHttpsFile = (path: string) => {
  const absolutePath = resolve(rootDir, path);

  if (!existsSync(absolutePath)) {
    throw new Error(`HTTPS certificate file not found: ${absolutePath}`);
  }

  return readFileSync(absolutePath);
};

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const httpsKey = env.DEV_HTTPS_KEY;
  const httpsCert = env.DEV_HTTPS_CERT;
  const useHttps = mode === "https";

  if (useHttps && (!httpsKey || !httpsCert)) {
    throw new Error(
      "HTTPS dev server requires DEV_HTTPS_KEY and DEV_HTTPS_CERT in web/.env",
    );
  }

  return {
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
      https:
        useHttps
          ? {
              key: readDevHttpsFile(httpsKey),
              cert: readDevHttpsFile(httpsCert),
            }
          : undefined,
      proxy: {
        "/api": {
          target: "http://localhost:8888",
          changeOrigin: true,
        },
        "/maps": {
          target: basemapOrigin,
          changeOrigin: true,
        },
      },
      allowedHosts: [".ngrok-free.app"],
    },
  };
});
