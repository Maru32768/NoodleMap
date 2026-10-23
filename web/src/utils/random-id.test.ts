import { randomId } from "@/utils/random-id.ts";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses randomUUID when available", () => {
    const uuid = "0f8e5d0c-1111-4222-8333-444455556666";
    vi.stubGlobal("crypto", { randomUUID: () => uuid });

    expect(randomId()).toBe(uuid);
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
