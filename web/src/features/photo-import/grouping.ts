import { distanceM } from "@/features/photo-import/matching.ts";
import type { LatLng, Photo } from "@/features/photo-import/photos.ts";
import { IsoDate, japanDate } from "@/features/visits/visit-date.ts";

/** Photos taken together at one place. Over-split on purpose: the plan re-merges by (shop, day). */
export interface PhotoGroup {
  /** The index of its first photo. */
  readonly id: number;
  /** JST day of the first photo, so a visit spanning midnight keeps one date. */
  readonly day: IsoDate;
  /** capturedAt ascending, then index: the order images are uploaded in, which resuming relies on. */
  readonly photos: readonly Photo[];
  /** Median lat and median lng of the located photos; null when none is located. */
  readonly center: LatLng | null;
}

/** A gap longer than this starts a new group. */
export const GROUP_MAX_GAP_MS = 30 * 60_000;
/** An unlocated photo joins the group only this soon after its last photo. */
export const UNLOCATED_MAX_GAP_MS = 20 * 60_000;
/** A located photo farther than this from the group's first located photo starts a new group. */
export const GROUP_MAX_SPREAD_M = 80;

export const byCapture = (a: Photo, b: Photo) =>
  a.capturedAt.getTime() - b.capturedAt.getTime() || a.index - b.index;

/**
 * Splits time-sorted photos whenever the gap or the spread is exceeded. Errs toward splitting:
 * fragments that resolve to the same shop on the same day are merged again by buildPlan, so an
 * over-split costs one extra review row, while an under-split would merge two shops' meals.
 */
export function groupPhotos(photos: readonly Photo[]): PhotoGroup[] {
  const runs: Photo[][] = [];
  for (const photo of [...photos].sort(byCapture)) {
    const run = runs.at(-1);
    if (run && joins(run, photo)) {
      run.push(photo);
    } else {
      runs.push([photo]);
    }
  }
  return runs.map((run) => {
    const located = run.flatMap((p) => (p.location ? [p.location] : []));
    return {
      id: run[0].index,
      day: japanDate(run[0].capturedAt),
      photos: run,
      center: located.length
        ? {
            lat: median(located.map((l) => l.lat)),
            lng: median(located.map((l) => l.lng)),
          }
        : null,
    };
  });
}

function joins(run: readonly Photo[], photo: Photo): boolean {
  if (photo.dateSource === "filename" || run[0].dateSource === "filename") {
    return false;
  }
  const gap =
    photo.capturedAt.getTime() - run[run.length - 1].capturedAt.getTime();
  if (!photo.location) {
    // The second bowl shot indoors without a fix.
    return gap <= UNLOCATED_MAX_GAP_MS;
  }
  const anchor = run.find((p) => p.location)?.location;
  return (
    gap <= GROUP_MAX_GAP_MS &&
    (!anchor || distanceM(anchor, photo.location) <= GROUP_MAX_SPREAD_M)
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
