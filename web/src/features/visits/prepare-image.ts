import type { Result } from "@/utils/result.ts";
import { err, ok } from "@/utils/result.ts";

// Mirrors UploadVisitImageRequest in typespec/main.tsp: JPEG or PNG of at most 15 MB.
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const UPLOAD_TYPES: readonly string[] = ["image/jpeg", "image/png"];

// Long edge of a re-encoded image; the server scales it down further to 2048 px.
export const CONVERTED_MAX_EDGE = 4096;
const CONVERTED_JPEG_QUALITY = 0.9;

/** Whether the browser must re-encode the file before upload (HEIC, WebP, ..., or too large). */
export function needsConversion(file: Pick<Blob, "type" | "size">): boolean {
  return !UPLOAD_TYPES.includes(file.type) || file.size > UPLOAD_MAX_BYTES;
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
 * the size limit; otherwise decoded by the browser (upright, as displayed),
 * scaled to fit {@link CONVERTED_MAX_EDGE} and re-encoded as JPEG.
 * Fails when the browser cannot decode it.
 */
export async function prepareImageForUpload(
  file: File,
): Promise<Result<PreparedImage, "undecodable">> {
  if (!needsConversion(file)) {
    return ok({ blob: file, fileName: file.name });
  }
  const source = await decode(file);
  if (!source) {
    return err("undecodable");
  }
  try {
    const size = fitWithin(source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context || source.width === 0 || source.height === 0) {
      return err("undecodable");
    }
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
