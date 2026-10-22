import type { StorybookConfig } from "@storybook/react-vite";
import { withoutAppOnlyPlugins } from "../vite.config.ts";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  addons: ["@storybook/addon-vitest"],
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: withoutAppOnlyPlugins(viteConfig.plugins),
    // Stories use no public assets, and public/maps can hold multi-GB basemaps.
    publicDir: false,
  }),
};

export default config;
