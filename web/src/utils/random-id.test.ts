import { randomId } from "@/utils/random-id.ts";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses randomUUID when available", () => {
    expect(randomId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("falls back to random hex without randomUUID (insecure context)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real),
    });

    const id = randomId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(randomId()).not.toBe(id);
  });
});
