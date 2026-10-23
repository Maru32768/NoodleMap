import { retryAfterMs } from "@/features/visits/api/use-visit-images.ts";
import {
  fitWithin,
  needsConversion,
  prepareImageForUpload,
  UPLOAD_MAX_BYTES,
} from "@/features/visits/prepare-image.ts";
import { describe, expect, it } from "vitest";

describe("needsConversion", () => {
  it("uploads a JPEG or PNG within 15 MB as is", () => {
    expect(needsConversion({ type: "image/jpeg", size: 1024 })).toBe(false);
    expect(needsConversion({ type: "image/png", size: UPLOAD_MAX_BYTES })).toBe(
      false,
    );
  });

  it("converts other formats, including an unknown type", () => {
    for (const type of ["image/heic", "image/webp", "image/gif", ""]) {
      expect(needsConversion({ type, size: 1024 })).toBe(true);
    }
  });

  it("converts a JPEG or PNG larger than 15 MB", () => {
    expect(
      needsConversion({ type: "image/jpeg", size: UPLOAD_MAX_BYTES + 1 }),
    ).toBe(true);
    expect(
      needsConversion({ type: "image/png", size: UPLOAD_MAX_BYTES + 1 }),
    ).toBe(true);
  });
});

describe("fitWithin", () => {
  it("scales the long edge down to 4096", () => {
    expect(fitWithin(8000, 6000)).toEqual({ width: 4096, height: 3072 });
    expect(fitWithin(3000, 9000)).toEqual({ width: 1365, height: 4096 });
  });

  it("never enlarges a smaller image", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
  });
});

describe("prepareImageForUpload", () => {
  it("keeps a JPEG within the limit unchanged", async () => {
    const file = new File(["jpeg"], "ramen.jpg", { type: "image/jpeg" });

    const result = await prepareImageForUpload(file);

    expect(result).toEqual({
      ok: true,
      data: { blob: file, fileName: "ramen.jpg" },
    });
  });

  it("fails on a format the browser cannot decode", async () => {
    // jsdom decodes no images, like a browser without HEIC support.
    const file = new File(["heic"], "ramen.heic", { type: "image/heic" });

    expect(await prepareImageForUpload(file)).toEqual({
      ok: false,
      error: "undecodable",
    });
  });
});

describe("retryAfterMs", () => {
  const headers = (value?: string) =>
    new Headers(value === undefined ? {} : { "Retry-After": value });

  it("waits the seconds the server asked for, at most 30", () => {
    expect(retryAfterMs(headers("5"))).toBe(5000);
    expect(retryAfterMs(headers("0"))).toBe(0);
    expect(retryAfterMs(headers("120"))).toBe(30_000);
  });

  it("waits 5 seconds when the header is missing or not a number", () => {
    expect(retryAfterMs(headers())).toBe(5000);
    expect(retryAfterMs(headers("Wed, 21 Oct 2026 07:28:00 GMT"))).toBe(5000);
  });
});
