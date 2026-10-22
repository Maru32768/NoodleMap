import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig, { withoutAppOnlyPlugins } from "./vite.config.ts";

export default defineConfig((env) => {
  const base = viteConfig(env);

  return mergeConfig(
    { ...base, plugins: withoutAppOnlyPlugins(base.plugins) },
    {
      test: {
        projects: [
          {
            extends: true,
            test: {
              name: "unit",
              environment: "jsdom",
              setupFiles: ["./src/test/setup.ts"],
              include: ["src/**/*.test.{ts,tsx}"],
              // The first Chakra render in a file can exceed 5s on a loaded machine or CI runner.
              testTimeout: 20_000,
            },
          },
          {
            extends: true,
            plugins: [storybookTest({ configDir: ".storybook" })],
            test: {
              name: "storybook",
              browser: {
                enabled: true,
                headless: true,
                provider: playwright(),
                instances: [{ browser: "chromium" }],
              },
            },
          },
        ],
        coverage: {
          provider: "v8",
          include: ["src/**/*.{ts,tsx}"],
          exclude: [
            "src/generated/**",
            "src/test/**",
            "src/**/*.test.{ts,tsx}",
            "src/**/*.stories.tsx",
            "src/**/*.d.ts",
          ],
        },
      },
    },
  );
});
