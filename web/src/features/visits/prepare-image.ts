import type { Result } from "@/utils/result.ts";
import { err, ok } from "@/utils/result.ts";

// Mirrors UploadVisitImageRequest in typespec/main.tsp: JPEG or PNG of at most 15 MB.
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const UPLOAD_TYPES: readonly string[] = ["image/jpeg", "image/png"];

// JPEG/PNG beyond these are converted too: the server refuses a progressive
// JPEG over 30 MP (and anything over 60 MP), and a huge decode is slow.
export const UPLOAD_MAX_PIXELS = 30_000_000;
export const UPLOAD_MAX_EDGE = 8000;

// Long edge of a re-encoded image; the server scales it down further to 2048 px.
export const CONVERTED_MAX_EDGE = 4096;
const CONVERTED_JPEG_QUALITY = 0.9;

// Enough to reach a JPEG's frame header past large EXIF/ICC segments.
const HEADER_BYTES = 1024 * 1024;

/** Whether the file's type or size alone requires re-encoding (HEIC, WebP, ..., or over 15 MB). */
export function needsConversion(file: Pick<Blob, "type" | "size">): boolean {
  return !UPLOAD_TYPES.includes(file.type) || file.size > UPLOAD_MAX_BYTES;
}

/** Whether a JPEG/PNG of this size must be scaled down before upload. */
export function exceedsPixelLimit(size: {
  width: number;
  height: number;
}): boolean {
  return (
    size.width * size.height > UPLOAD_MAX_PIXELS ||
    Math.max(size.width, size.height) > UPLOAD_MAX_EDGE
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Width and height from the start of a PNG (IHDR) or JPEG (frame header)
 * without decoding it; null when they are not found in `bytes`.
 */
export function readImageSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i: number) => ((u16(i) << 16) | u16(i + 2)) >>> 0;
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return bytes.length >= 24 ? { width: u32(16), height: u32(20) } : null;
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      return null;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      // Fill byte before a marker.
      i++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      return i + 8 < bytes.length
        ? { width: u16(i + 7), height: u16(i + 5) }
        : null;
    }
    if (marker === 0xda) {
      // Scan data started without a frame header.
      return null;
    }
    i += 2 + u16(i + 2);
  }
  return null;
}

async function readFileImageSize(file: Blob) {
  try {
    const head = await file.slice(0, HEADER_BYTES).arrayBuffer();
    return readImageSize(new Uint8Array(head));
  } catch {
    return null;
  }
}

/** The size that fits `width` x `height` within `maxEdge` on its long edge, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = CONVERTED_MAX_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface PreparedImage {
  blob: Blob;
  fileName: string;
}

/**
 * The file as the server accepts it: unchanged when it is a JPEG or PNG within
 * the size and pixel limits; otherwise decoded by the browser (upright, as
 * displayed), scaled to fit {@link CONVERTED_MAX_EDGE}, flattened onto white
 * and re-encoded as JPEG. `onConvert` is called when re-encoding starts.
 * Fails when the browser cannot decode it.
 */
export async function prepareImageForUpload(
  file: File,
  onConvert?: () => void,
): Promise<Result<PreparedImage, "undecodable">> {
  if (!needsConversion(file)) {
    const size = await readFileImageSize(file);
    // An unreadable header is left to the server to judge.
    if (!size || !exceedsPixelLimit(size)) {
      return ok({ blob: file, fileName: file.name });
    }
  }
  onConvert?.();
  const source = await decode(file);
  if (!source) {
    return err("undecodable");
  }
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d");
    if (!context || source.width === 0 || source.height === 0) {
      return err("undecodable");
    }
    const size = fitWithin(source.width, source.height);
    canvas.width = size.width;
    canvas.height = size.height;
    // JPEG has no transparency; the server also flattens onto white.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(source.image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CONVERTED_JPEG_QUALITY),
    );
    if (!blob) {
      return err("undecodable");
    }
    return ok({ blob, fileName: jpegFileName(file.name) });
  } finally {
    source.release();
    // Frees the bitmap memory now rather than when the canvas is collected.
    canvas.width = 0;
    canvas.height = 0;
  }
}

function jpegFileName(name: string): string {
  return `${name.replace(/\.[^./\\]*$/, "") || "image"}.jpg`;
}

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" draws the photo upright by its EXIF orientation.
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some browsers decode more formats through <img> (Safari and HEIC).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
