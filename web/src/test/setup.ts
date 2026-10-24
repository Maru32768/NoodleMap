import { server } from "@/test/server.ts";
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach } from "vitest";

// findBy*/waitFor give up after 1 s by default. Reaching a ready state in the
// modal tests (dialog opens a frame after mount, renders, fetches through MSW,
// renders the data) takes 1.3–1.8 s with the test file running alone, and
// 3–5 s for the first test in a file while the full suite saturates the CPU.
// Waiting
// longer costs nothing when the state arrives; half of testTimeout (see
// vitest.config.ts) still lets a stuck wait fail with its own DOM dump.
configure({ asyncUtilTimeout: 10_000 });

// Browsers resolve relative request URLs against the document; Node's Request
// rejects them, and the app's apiClient calls relative `/api/...` paths.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === "string" ? new URL(input, location.href) : input,
      init,
    );
  }
};

// jsdom has no matchMedia; next-themes (inside the Chakra Provider) needs it.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) satisfies MediaQueryList;

// apiClient captures fetch/Request when its module is imported, which happens
// before beforeAll hooks run, so interception has to start at setup time.
server.listen({ onUnhandledFrame: "error" });

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});

afterAll(() => {
  server.close();
});
