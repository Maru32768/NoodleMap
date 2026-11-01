import { vi } from "vitest";

// jsdom matches no media query, which renders the phone layout; this renders
// the PC one (`md` and up) until mocks are restored.
export function stubPcWidth() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("min-width"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
}
