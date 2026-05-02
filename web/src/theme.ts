import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        noodle: {
          50: { value: "#FFF7ED" },
          100: { value: "#FFE7CC" },
          200: { value: "#FFD0A3" },
          300: { value: "#FFB176" },
          400: { value: "#FF934D" },
          500: { value: "#E67633" },
          600: { value: "#C35A23" },
          700: { value: "#9C441A" },
          800: { value: "#6A2D10" },
          900: { value: "#421A09" },
          950: { value: "#260E04" },
        },
      },
      fonts: {
        display: {
          value:
            '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif',
        },
        body: {
          value: '"noto-sans-jp", "Hiragino Sans", "Yu Gothic", sans-serif',
        },
        mono: {
          value: '"JetBrains Mono", ui-monospace, monospace',
        },
      },
      shadows: {
        nmSm: {
          value:
            "0 1px 2px rgba(26, 22, 20, 0.06), 0 1px 1px rgba(26, 22, 20, 0.04)",
        },
        nmMd: {
          value:
            "0 4px 14px rgba(26, 22, 20, 0.08), 0 2px 4px rgba(26, 22, 20, 0.05)",
        },
        nmLg: {
          value:
            "0 18px 48px rgba(26, 22, 20, 0.18), 0 6px 14px rgba(26, 22, 20, 0.08)",
        },
      },
      radii: {
        nmSm: { value: "4px" },
        nmMd: { value: "8px" },
        nmLg: { value: "14px" },
      },
    },

    semanticTokens: {
      colors: {
        noodle: {
          solid: { value: "{colors.noodle.500}" },
          contrast: { value: "white" },
          subtle: { value: "{colors.noodle.50}" },
          muted: { value: "{colors.noodle.100}" },
          emphasized: { value: "{colors.noodle.600}" },
          fg: { value: "{colors.noodle.900}" },
          focusRing: { value: "{colors.noodle.400}" },
        },
        nm: {
          bg: { value: "#f4ede0" },
          bgSoft: { value: "#ebe1cf" },
          paper: { value: "#faf6ec" },
          ink: { value: "#1a1614" },
          inkSoft: { value: "#3a322c" },
          inkMuted: { value: "#6b5e52" },
          inkFaint: { value: "#a89a8a" },
          shu: { value: "#b54a3c" },
          shuDeep: { value: "#8c2e21" },
          shuSoft: { value: "#d97a6c" },
          kincha: { value: "#b88947" },
          kinchaSoft: { value: "#d4a96a" },
          matcha: { value: "#6b7a3c" },
          line: { value: "rgba(26, 22, 20, 0.12)" },
          lineStrong: { value: "rgba(26, 22, 20, 0.22)" },
          lineFaint: { value: "rgba(26, 22, 20, 0.06)" },
        },
      },
    },
  },

  globalCss: {
    html: {
      colorPalette: "noodle",
      height: "100%",
      minHeight: "100vh",
      minWidth: "20rem",
    },
    body: {
      fontFamily: "body",
      fontWeight: "400",
      fontSize: "0.875rem",
      lineHeight: "1.6",
      color: "{colors.nm.ink}",
      background: "{colors.nm.bg}",
    },
    "#root": {
      width: "100vw",
      height: "100vh",
    },
  },
});

export const system = createSystem(defaultConfig, config);
