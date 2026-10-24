import { byCapture, PhotoGroup } from "@/features/photo-import/grouping.ts";
import type { Match } from "@/features/photo-import/matching.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import type { VisitLog } from "@/features/visits/api/use-visits.ts";
import type { IsoDate } from "@/features/visits/visit-date.ts";
import { VISIT_IMAGES_MAX } from "@/utils/toast.ts";

export type ShopChoice =
  | {
      readonly kind: "shop";
      readonly shopId: string;
      readonly source: "auto" | "existing" | "admin";
    }
  | { readonly kind: "skip" }
  | { readonly kind: "undecided" };

/** Admin input only. The default choice is derived, never copied in here. */
export interface ReviewState {
  /** By group id. */
  readonly choices: ReadonlyMap<number, ShopChoice>;
  /** Photo indexes. */
  readonly excluded: ReadonlySet<number>;
}

/** The server's visits of each shop that matters to the import, by shop id. */
export type ServerVisits = ReadonlyMap<string, readonly VisitLog[]>;

/** The visit's identity on the server: one shop, one JST day. */
// shortcut: two real visits to one shop on one day become one visit, upgrade by keying on capture time if that ever matters.
export type VisitKey = `${string}|${IsoDate}`;

export const visitKey = (shopId: string, day: IsoDate): VisitKey =>
  `${shopId}|${day}`;

export interface PlanEntry {
  readonly key: VisitKey;
  readonly shopId: string;
  readonly day: IsoDate;
  /** At most VISIT_IMAGES_MAX, capturedAt asc then index, across every merged group. */
  readonly photos: readonly Photo[];
  /** Photos beyond the cap; never uploaded, shown as a warning. */
  readonly overflow: number;
  /** The earliest entry of its shop in this plan; only it may date the shop's dateless visit. */
  readonly claimsDateless: boolean;
}

/** Entries in run order: admin-decided first, then the rest; each tier by day. */
export interface ImportPlan {
  /** Keys are unique: entries are built from a Map keyed by VisitKey. */
  readonly entries: readonly PlanEntry[];
}

/** What a fresh look at the shop's server visits says to do for one entry. */
export type EntryAction =
  | { readonly kind: "create" }
  /** PUT its fields back plus visitedOn. */
  | { readonly kind: "claim"; readonly visit: VisitLog }
  | {
      readonly kind: "resume";
      readonly visitId: string;
      readonly uploaded: number;
    }
  | { readonly kind: "done"; readonly visitId: string };

/**
 * The choice before the admin touches the row.
 * 0. Filename dates always need the admin to choose a shop.
 * 1. Exactly one candidate shop already has a visit dated `group.day`: that shop, source "existing".
 *    This makes a re-run converge even when the admin's earlier picks were lost with the tab.
 *    Two or more such shops: undecided.
 * 2. match auto: shop, source "auto".  ambiguous: undecided.
 * 3. far / no_location: skip. Photos far from every shop never silently become visits.
 */
export function defaultChoice(
  group: PhotoGroup,
  match: Match,
  serverVisits: ServerVisits,
): ShopChoice {
  if (group.photos[0].dateSource === "filename") {
    return { kind: "undecided" };
  }
  if (match.kind === "far" || match.kind === "no_location") {
    return { kind: "skip" };
  }
  const visited = match.candidates.filter((c) =>
    serverVisits.get(c.shop.id)?.some((v) => v.visitedOn === group.day),
  );
  if (visited.length === 1) {
    return { kind: "shop", shopId: visited[0].shop.id, source: "existing" };
  }
  if (visited.length === 0 && match.kind === "auto") {
    return {
      kind: "shop",
      shopId: match.candidates[0].shop.id,
      source: "auto",
    };
  }
  return { kind: "undecided" };
}

/**
 * Every group whose effective choice is a shop, minus excluded photos, merged by (shopId, day).
 * Photos are sorted (capturedAt, index) and capped at VISIT_IMAGES_MAX. claimsDateless marks the
 * earliest day per shop. Order: entries containing an admin-decided group first (a crash then
 * loses mostly auto picks, which re-matching reproduces), then the rest, each by day.
 */
export function buildPlan(
  groups: readonly PhotoGroup[],
  choiceOf: (group: PhotoGroup) => ShopChoice,
  excluded: ReadonlySet<number>,
): ImportPlan {
  const merged = new Map<
    VisitKey,
    { shopId: string; day: IsoDate; photos: Photo[]; admin: boolean }
  >();
  for (const group of groups) {
    const choice = choiceOf(group);
    const photos = group.photos.filter((p) => !excluded.has(p.index));
    if (choice.kind !== "shop" || photos.length === 0) {
      continue;
    }
    const key = visitKey(choice.shopId, group.day);
    const entry = merged.get(key) ?? {
      shopId: choice.shopId,
      day: group.day,
      photos: [],
      admin: false,
    };
    entry.photos.push(...photos);
    entry.admin ||= choice.source === "admin";
    merged.set(key, entry);
  }

  const earliestDay = new Map<string, IsoDate>();
  for (const { shopId, day } of merged.values()) {
    const earliest = earliestDay.get(shopId);
    if (!earliest || day < earliest) {
      earliestDay.set(shopId, day);
    }
  }

  const entries = [...merged]
    .sort(
      ([ka, a], [kb, b]) =>
        Number(b.admin) - Number(a.admin) ||
        a.day.localeCompare(b.day) ||
        ka.localeCompare(kb),
    )
    .map(([key, { shopId, day, photos }]) => {
      const sorted = photos.sort(byCapture);
      return {
        key,
        shopId,
        day,
        photos: sorted.slice(0, VISIT_IMAGES_MAX),
        overflow: Math.max(0, sorted.length - VISIT_IMAGES_MAX),
        claimsDateless: earliestDay.get(shopId) === day,
      };
    });
  return { entries };
}

/**
 * Decides one entry from the shop's current server visits. Pure; the runner calls it right
 * after a fresh GET, so the decision never trusts anything remembered from an earlier run.
 */
export function decideAction(
  entry: PlanEntry,
  visits: readonly VisitLog[],
): EntryAction {
  const sameDay = visits.filter((v) => v.visitedOn === entry.day);
  if (sameDay.length > 0) {
    const target = sameDay.reduce((best, v) =>
      v.images.length > best.images.length ? v : best,
    );
    const uploaded = target.images.length;
    // shortcut: images are identified by position, not content, so a same-day visit logged by hand with m photos gets only photos[m..]; review shows it as 既存の訪問 (画像m枚). Upgrade if the server ever keeps a content hash.
    return uploaded >= entry.photos.length
      ? { kind: "done", visitId: target.id }
      : { kind: "resume", visitId: target.id, uploaded };
  }
  if (entry.claimsDateless) {
    // A dateless visit with images is left alone: its images would break the count-as-cursor rule.
    const dateless = visits.find(
      (v) => v.visitedOn === undefined && v.images.length === 0,
    );
    if (dateless) {
      return { kind: "claim", visit: dateless };
    }
  }
  return { kind: "create" };
}
