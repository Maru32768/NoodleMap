import { retryAfterMs } from "@/features/meal-records/api/use-meal-record-images.ts";
import {
  exceedsPixelLimit,
  fitWithin,
  needsConversion,
  prepareImageForUpload,
  readImageSize,
  UPLOAD_MAX_BYTES,
} from "@/features/meal-records/prepare-image.ts";
import { afterEach, describe, expect, it, vi } from "vitest";

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

// A PNG signature and IHDR chunk for `width` x `height`.
function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

// SOI, an APP0 segment, then a baseline frame header (SOF0) for `width` x `height`.
function jpegHeader(width: number, height: number) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x06,
    0x4a,
    0x46,
    0x49,
    0x46,
    0xff,
    0xff, // a fill byte before the next marker
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
  ]);
}

describe("readImageSize", () => {
  it("reads a PNG's IHDR", () => {
    expect(readImageSize(pngHeader(4032, 3024))).toEqual({
      width: 4032,
      height: 3024,
    });
  });

  it("reads a JPEG's frame header past other segments", () => {
    expect(readImageSize(jpegHeader(6000, 4000))).toEqual({
      width: 6000,
      height: 4000,
    });
  });

  it("skips standalone markers and stops at the end of the image", () => {
    const withStandalone = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xd8,
      0xff,
      0x01,
      0xff,
      0xd3,
      ...jpegHeader(640, 480).slice(2),
    ]);
    expect(readImageSize(withStandalone)).toEqual({ width: 640, height: 480 });
    expect(
      readImageSize(
        new Uint8Array([0xff, 0xd8, 0xff, 0xd9, ...jpegHeader(640, 480)]),
      ),
    ).toBeNull();
  });

  it("gives up on anything else", () => {
    expect(readImageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe("exceedsPixelLimit", () => {
  it("allows a typical phone photo", () => {
    expect(exceedsPixelLimit({ width: 4032, height: 3024 })).toBe(false);
  });

  it("flags more than 30 MP or a long edge over 8000", () => {
    expect(exceedsPixelLimit({ width: 7000, height: 5000 })).toBe(true);
    expect(exceedsPixelLimit({ width: 9000, height: 1000 })).toBe(true);
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

  it("tries to shrink a JPEG with too many pixels, sending the original when it cannot", async () => {
    const file = new File([jpegHeader(9000, 6000)], "huge.jpg", {
      type: "image/jpeg",
    });
    let converting = false;

    // jsdom cannot decode it; the server judges the original instead.
    const result = await prepareImageForUpload(file, () => {
      converting = true;
    });

    expect(converting).toBe(true);
    expect(result).toEqual({
      ok: true,
      data: { blob: file, fileName: "huge.jpg" },
    });
  });

  describe("with maxEdge", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    // A browser that decodes the photo at `width` x `height`; returns the drawn sizes.
    function decodableAs(width: number, height: number) {
      vi.stubGlobal("createImageBitmap", async () => ({
        width,
        height,
        close: () => {},
      }));
      const drawn: [number, number][] = [];
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillRect: () => {},
        drawImage: (_: unknown, _x: number, _y: number, w: number, h: number) =>
          drawn.push([w, h]),
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (callback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })),
      );
      return drawn;
    }

    it("shrinks a phone photo longer than maxEdge to fit it", async () => {
      const drawn = decodableAs(4032, 3024);
      const file = new File([jpegHeader(4032, 3024)], "IMG_0001.JPG", {
        type: "image/jpeg",
      });

      const result = await prepareImageForUpload(file, undefined, {
        maxEdge: 2048,
      });

      expect(drawn).toEqual([[2048, 1536]]);
      expect(result.ok && result.data.fileName).toBe("IMG_0001.jpg");
    });

    it("sends a photo within maxEdge unchanged, as without it", async () => {
      const drawn = decodableAs(1600, 1200);
      const file = new File([jpegHeader(1600, 1200)], "IMG_0002.JPG", {
        type: "image/jpeg",
      });

      const result = await prepareImageForUpload(file, undefined, {
        maxEdge: 2048,
      });

      expect(drawn).toEqual([]);
      expect(result).toEqual({
        ok: true,
        data: { blob: file, fileName: "IMG_0002.JPG" },
      });
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
