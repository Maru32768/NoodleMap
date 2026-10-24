import type { LatLng } from "@/features/photo-import/photos.ts";
import type { Shop } from "@/features/shops/api/use-shops.ts";

export interface Candidate {
  readonly shop: Shop;
  readonly distanceM: number;
}

export type Match =
  /** candidates[0] is the pick. */
  | { readonly kind: "auto"; readonly candidates: readonly Candidate[] }
  /** 1..MAX_CANDIDATES, nearest first. */
  | { readonly kind: "ambiguous"; readonly candidates: readonly Candidate[] }
  /** No shop within CANDIDATE_RADIUS_M. */
  | { readonly kind: "far" }
  | { readonly kind: "no_location" };

export const CANDIDATE_RADIUS_M = 200;
/** Auto-pick only within this distance: a food photo is taken inside the shop. */
export const AUTO_MAX_DISTANCE_M = 50;
/** ...and only when the runner-up is this much farther in absolute terms... */
export const AUTO_MIN_MARGIN_M = 30;
/** ...and at least this many times as far. */
export const AUTO_MIN_RATIO = 2;
export const MAX_CANDIDATES = 5;

/**
 * Nearest registered shops (closed ones included) within CANDIDATE_RADIUS_M of `center`.
 *
 * Auto iff  d1 <= 50  &&  (no runner-up || (d2 - d1 >= 30 && d2 >= 2 * d1)).
 *
 * Consequences, by design: two shops closer than 30 m apart can never auto-pick (5% of shops
 * have such a neighbor), so every dense-area group lands in 要確認 with one-tap candidates.
 * A shop alone in its block auto-picks at up to 50 m of indoor GPS error.
 */
export function matchShop(
  center: LatLng | null,
  shops: readonly Shop[],
): Match {
  if (!center) {
    return { kind: "no_location" };
  }
  // shortcut: a linear scan, about 1.5M distances for 1,000 groups x 1,465 shops (tens of ms), add a spatial index if shops grow tenfold.
  // An unregistered shop next to a registered one is invisible, so its photos auto-pick the neighbor; auto rows show the distance for the admin to scan, and この場所の店を追加 registers the right one.
  const candidates = shops
    .map((shop) => ({ shop, distanceM: distanceM(center, shop) }))
    .filter((c) => c.distanceM <= CANDIDATE_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) {
    return { kind: "far" };
  }
  const [d1, d2] = candidates.map((c) => c.distanceM);
  const auto =
    d1 <= AUTO_MAX_DISTANCE_M &&
    (d2 === undefined ||
      (d2 - d1 >= AUTO_MIN_MARGIN_M && d2 >= AUTO_MIN_RATIO * d1));
  return { kind: auto ? "auto" : "ambiguous", candidates };
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle (haversine) distance in meters. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
