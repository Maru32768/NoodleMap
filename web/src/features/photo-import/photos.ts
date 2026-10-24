import { IsoDate, japanDate } from "@/features/visits/visit-date.ts";
import { forEachConcurrently } from "@/utils/concurrency.ts";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** A selected JPEG with a known capture instant. Photos without one never reach grouping. */
export interface Photo {
  /** Position in the selection: a session-local id, never persisted. */
  readonly index: number;
  readonly file: File;
  /** Absolute instant from DateTimeOriginal + OffsetTimeOriginal (+09:00 when no offset). */
  readonly capturedAt: Date;
  readonly location: LatLng | null;
}

export interface PhotoRejection {
  readonly file: File;
  readonly reason: "not_jpeg" | "no_capture_time" | "future" | "unreadable";
}

// latitude and longitude are exifr's signed decimal degrees, derived from the GPS tags and refs.
interface RawExif {
  DateTimeOriginal?: unknown;
  OffsetTimeOriginal?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

const EXIF_TAGS = [
  "DateTimeOriginal",
  "OffsetTimeOriginal",
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
];
const READ_CONCURRENCY = 4;
const DAY_MS = 86_400_000;

/**
 * Reads capture time and GPS from the head of each file (exifr, loaded on first use),
 * a few files at a time. Rejects with the signal's reason once it aborts.
 */
export async function readPhotos(
  files: readonly File[],
  options: { signal: AbortSignal; onProgress: (done: number) => void },
): Promise<{ photos: Photo[]; rejected: PhotoRejection[] }> {
  const { default: exifr } = await import("exifr");
  // The server refuses a visit dated later than tomorrow in Japan.
  const latestDay = japanDate(new Date(Date.now() + DAY_MS));
  const results: (Photo | PhotoRejection)[] = [];
  let done = 0;

  async function readOne(file: File, index: number) {
    if (file.type !== "image/jpeg" && !/\.jpe?g$/i.test(file.name)) {
      return { file, reason: "not_jpeg" } as const;
    }
    let raw: RawExif | undefined;
    try {
      // reviveValues: false keeps DateTimeOriginal a string; revived, it
      // would be a Date in the browser's zone, not the camera's.
      raw = await exifr.parse(file, { pick: EXIF_TAGS, reviveValues: false });
    } catch {
      return { file, reason: "unreadable" } as const;
    }
    return photoFromExif(index, file, raw ?? {}, latestDay);
  }

  await forEachConcurrently(
    files,
    READ_CONCURRENCY,
    options.signal,
    async (file, index) => {
      results[index] = await readOne(file, index);
      options.onProgress(++done);
    },
  );
  const photos: Photo[] = [];
  const rejected: PhotoRejection[] = [];
  for (const result of results) {
    if ("reason" in result) {
      rejected.push(result);
    } else {
      photos.push(result);
    }
  }
  return { photos, rejected };
}

function photoFromExif(
  index: number,
  file: File,
  raw: RawExif,
  latestDay: IsoDate,
): Photo | PhotoRejection {
  const capturedAt = parseExifInstant(
    stringOrUndefined(raw.DateTimeOriginal),
    stringOrUndefined(raw.OffsetTimeOriginal),
  );
  if (!capturedAt) {
    return { file, reason: "no_capture_time" };
  }
  if (japanDate(capturedAt) > latestDay) {
    return { file, reason: "future" };
  }
  return { index, file, capturedAt, location: locationOf(raw) };
}

const stringOrUndefined = (value: unknown) =>
  typeof value === "string" ? value : undefined;

function locationOf({ latitude: lat, longitude: lng }: RawExif): LatLng | null {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ||
    // A camera without a fix may write zeros.
    (lat === 0 && lng === 0)
  ) {
    return null;
  }
  return { lat, lng };
}

const EXIF_DATE_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const UTC_OFFSET = /^([+-])(\d{2}):(\d{2})$/;
const JST_OFFSET_MINUTES = 9 * 60;

/** "2023:04:01 12:34:56" + "+09:00" -> instant. A missing offset means the camera clock was JST. */
export function parseExifInstant(
  dateTime: string | undefined,
  offset: string | undefined,
): Date | null {
  const match = dateTime?.trim().match(EXIF_DATE_TIME);
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date.UTC rolls 02-30 over into March and maps years below 100 to 19xx.
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() !== month - 1 ||
    wall.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  const zone = offset?.trim().match(UTC_OFFSET);
  const offsetMinutes = zone
    ? (zone[1] === "-" ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3]))
    : JST_OFFSET_MINUTES;
  return new Date(wall.getTime() - offsetMinutes * 60_000);
}
