import type {
  MealRecord,
  MealRecordInput,
} from "@/features/meal-records/api/use-meal-records.ts";
import type { IsoDate } from "@/features/meal-records/eaten-date.ts";
import { byCapture, PhotoGroup } from "@/features/photo-import/grouping.ts";
import type { Match } from "@/features/photo-import/matching.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import { MEAL_RECORD_IMAGES_MAX } from "@/utils/toast.ts";

export type ShopChoice =
  | {
      readonly kind: "shop";
      readonly shopId: string;
      readonly source: "auto" | "existing" | "admin";
    }
  /** No registered shop, such as a festival booth: always the admin's. venueName is trimmed and non-empty. */
  | { readonly kind: "venue"; readonly venueName: string }
  | { readonly kind: "skip" }
  | { readonly kind: "undecided" };

/** Admin input only. The default choice is derived, never copied in here. */
export interface ReviewState {
  /** By group id. */
  readonly choices: ReadonlyMap<number, ShopChoice>;
  /** Photo indexes. */
  readonly excluded: ReadonlySet<number>;
  /** Photo indexes of a meal record the import will make, in the order the admin put them. */
  readonly order: ReadonlyMap<MealRecordKey, readonly number[]>;
  /** What the admin wrote for a meal record the import will make. */
  readonly details: ReadonlyMap<MealRecordKey, MealRecordDetails>;
}

/**
 * A meal record's fields beyond its day, which comes from the photos. shopIds always holds the
 * key's shop; any other is a collaborating shop. A venue key's record has no shop, and its
 * venueName is the key's venue.
 */
export type MealRecordDetails = Omit<MealRecordInput, "eatenOn">;

/** What a meal record the import makes belongs to: a registered shop, or a 催事・出店先 without one. */
export type RecordTarget =
  | { readonly kind: "shop"; readonly shopId: string }
  | { readonly kind: "venue"; readonly venueName: string };

export type TargetKey = `shop:${string}` | `venue:${string}`;

export const targetKey = (target: RecordTarget): TargetKey =>
  target.kind === "shop"
    ? `shop:${target.shopId}`
    : `venue:${target.venueName}`;

export const targetOf = (choice: ShopChoice): RecordTarget | null =>
  choice.kind === "shop" || choice.kind === "venue" ? choice : null;

/** The server's mealRecords of each shop or venue that matters to the import. */
export type ServerMealRecords = ReadonlyMap<TargetKey, readonly MealRecord[]>;

export const recordsOf = (
  serverMealRecords: ServerMealRecords,
  target: RecordTarget,
) => serverMealRecords.get(targetKey(target)) ?? [];

/** The mealRecord's identity on the server: one shop (or shop-less venue), one JST day. */
// shortcut: two real meal records to one shop on one day become one meal record, upgrade by keying on capture time if that ever matters.
export type MealRecordKey = `${TargetKey}|${IsoDate}`;

export const mealRecordKey = (
  target: RecordTarget,
  day: IsoDate,
): MealRecordKey => `${targetKey(target)}|${day}`;

export interface PlanEntry {
  readonly key: MealRecordKey;
  readonly target: RecordTarget;
  readonly day: IsoDate;
  /** At most MEAL_RECORD_IMAGES_MAX across every merged group, in {@link photoOrder}. */
  readonly photos: readonly Photo[];
  /** Photos beyond the cap; never uploaded, shown as a warning. */
  readonly overflow: number;
  /** The earliest entry of its target in this plan; only it may date the target's dateless mealRecord. */
  readonly claimsDateless: boolean;
  /** Written when the meal record is created or claimed; an existing same-day record keeps its own. */
  readonly details: MealRecordDetails | undefined;
}

/**
 * The order an entry's photos upload in: the admin's first, then capture order for photos it
 * does not list. Resuming counts uploaded photos along it, so the review only lets it change
 * before the meal record has images.
 */
// shortcut: an order lost with its tab mid-run resumes in capture order and uploads the wrong rest; upgrade by remembering the order outside the tab.
export function photoOrder(order: readonly number[] | undefined) {
  const rank = (p: Photo) => {
    const i = order?.indexOf(p.index) ?? -1;
    return i === -1 ? Infinity : i;
  };
  // Infinity - Infinity is NaN, which falls through to capture order.
  return (a: Photo, b: Photo) => rank(a) - rank(b) || byCapture(a, b);
}

/** The shops the entry's meal record is served by: its own plus any collaborating one; none for a venue. */
export const entryShopIds = (entry: PlanEntry): readonly string[] =>
  entry.target.kind === "shop"
    ? (entry.details?.shopIds ?? [entry.target.shopId])
    : [];

/** Entries in run order: admin-decided first, then the rest; each tier by day. */
export interface ImportPlan {
  /** Keys are unique: entries are built from a Map keyed by MealRecordKey. */
  readonly entries: readonly PlanEntry[];
}

/** What a fresh look at the target's server mealRecords says to do for one entry. */
export type EntryAction =
  | { readonly kind: "create" }
  /** PUT its fields back plus eatenOn. */
  | { readonly kind: "claim"; readonly mealRecord: MealRecord }
  | {
      readonly kind: "resume";
      readonly mealRecordId: string;
      readonly uploaded: number;
    }
  | { readonly kind: "done"; readonly mealRecordId: string };

/**
 * The choice before the admin touches the row.
 * 0. Filename dates always need the admin to choose a shop.
 * 1. Exactly one candidate shop already has a meal record dated `group.day`: that shop, source "existing".
 *    This makes a re-run converge even when the admin's earlier picks were lost with the tab.
 *    Two or more such shops: undecided.
 * 2. match auto: shop, source "auto".  ambiguous: undecided.
 * 3. far / no_location: skip. Photos far from every shop never silently become mealRecords.
 */
export function defaultChoice(
  group: PhotoGroup,
  match: Match,
  serverMealRecords: ServerMealRecords,
): ShopChoice {
  if (group.photos[0].dateSource === "filename") {
    return { kind: "undecided" };
  }
  if (match.kind === "far" || match.kind === "no_location") {
    return { kind: "skip" };
  }
  const candidatesWithRecords = match.candidates.filter((c) =>
    recordsOf(serverMealRecords, { kind: "shop", shopId: c.shop.id }).some(
      (v) => v.eatenOn === group.day,
    ),
  );
  if (candidatesWithRecords.length === 1) {
    return {
      kind: "shop",
      shopId: candidatesWithRecords[0].shop.id,
      source: "existing",
    };
  }
  if (candidatesWithRecords.length === 0 && match.kind === "auto") {
    return {
      kind: "shop",
      shopId: match.candidates[0].shop.id,
      source: "auto",
    };
  }
  return { kind: "undecided" };
}

/**
 * Every group whose effective choice is a shop or venue, minus excluded photos, merged by
 * (target, day). Photos are sorted (capturedAt, index) and capped at MEAL_RECORD_IMAGES_MAX.
 * claimsDateless marks the earliest day per target. Order: entries containing an admin-decided group first (a crash then
 * loses mostly auto picks, which re-matching reproduces), then the rest, each by day.
 */
export function buildPlan(
  groups: readonly PhotoGroup[],
  choiceOf: (group: PhotoGroup) => ShopChoice,
  excluded: ReadonlySet<number>,
  details: ReadonlyMap<MealRecordKey, MealRecordDetails>,
  order: ReadonlyMap<MealRecordKey, readonly number[]>,
): ImportPlan {
  const merged = new Map<
    MealRecordKey,
    { target: RecordTarget; day: IsoDate; photos: Photo[]; admin: boolean }
  >();
  for (const group of groups) {
    const choice = choiceOf(group);
    const target = targetOf(choice);
    const photos = group.photos.filter((p) => !excluded.has(p.index));
    if (!target || photos.length === 0) {
      continue;
    }
    const key = mealRecordKey(target, group.day);
    const entry = merged.get(key) ?? {
      target,
      day: group.day,
      photos: [],
      admin: false,
    };
    entry.photos.push(...photos);
    entry.admin ||= choice.kind !== "shop" || choice.source === "admin";
    merged.set(key, entry);
  }

  const earliestDay = new Map<TargetKey, IsoDate>();
  for (const { target, day } of merged.values()) {
    const earliest = earliestDay.get(targetKey(target));
    if (!earliest || day < earliest) {
      earliestDay.set(targetKey(target), day);
    }
  }

  const entries = [...merged]
    .sort(
      ([ka, a], [kb, b]) =>
        Number(b.admin) - Number(a.admin) ||
        a.day.localeCompare(b.day) ||
        ka.localeCompare(kb),
    )
    .map(([key, { target, day, photos }]) => {
      const sorted = photos.sort(photoOrder(order.get(key)));
      return {
        key,
        target,
        day,
        photos: sorted.slice(0, MEAL_RECORD_IMAGES_MAX),
        overflow: Math.max(0, sorted.length - MEAL_RECORD_IMAGES_MAX),
        claimsDateless: earliestDay.get(targetKey(target)) === day,
        details: details.get(key),
      };
    });
  return { entries };
}

/**
 * Decides one entry from its target's current server mealRecords. A venue's mealRecords all carry
 * that venue, so the exact-shops rule below leaves only its shop-less ones for a venue entry.
 * Pure; the runner calls it right after a fresh GET, so the decision never trusts anything remembered from an earlier run.
 */
export function decideAction(
  entry: PlanEntry,
  mealRecords: readonly MealRecord[],
): EntryAction {
  // Only a meal record of exactly these shops is this entry's: a collaboration is another meal.
  // shortcut: a collaboration made by an earlier run is not recognized once the tab that held its shops is gone, so running the photos again makes a separate meal record; upgrade by remembering details outside the tab.
  const shopIds = entryShopIds(entry);
  const sameShopsMealRecords = mealRecords.filter(
    (v) =>
      v.shops.length === shopIds.length &&
      v.shops.every((shop) => shopIds.includes(shop.id)),
  );
  const sameDay = sameShopsMealRecords.filter((v) => v.eatenOn === entry.day);
  if (sameDay.length > 0) {
    const target = sameDay.reduce((best, v) =>
      v.images.length > best.images.length ? v : best,
    );
    const uploaded = target.images.length;
    // shortcut: images are identified by position, not content, so a same-day meal recorded by hand with m photos gets only photos[m..]; review shows it as 既存の記録 (画像m枚). Upgrade if the server ever keeps a content hash.
    return uploaded >= entry.photos.length
      ? { kind: "done", mealRecordId: target.id }
      : { kind: "resume", mealRecordId: target.id, uploaded };
  }
  if (entry.claimsDateless) {
    // A dateless meal record with images is left alone: its images would break the count-as-cursor rule.
    const dateless = sameShopsMealRecords.find(
      (v) => v.eatenOn === undefined && v.images.length === 0,
    );
    if (dateless) {
      return { kind: "claim", mealRecord: dateless };
    }
  }
  return { kind: "create" };
}
