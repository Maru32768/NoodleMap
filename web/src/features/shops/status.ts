import type { Shop } from "@/features/shops/api/use-shops.ts";
import dayjs, { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

// Strict format parsing so malformed dates (e.g. month 13) are rejected rather
// than silently rolling over the way the native Date constructor would.
dayjs.extend(customParseFormat);

const DATE_FORMAT = "YYYY-MM-DD";

export type ShopLifecycleStatus =
  | "closed"
  | "upcoming"
  | "closingSoon"
  | "open";

export type ShopRecencyStatus = "new" | "regular";

export type ShopEatenStatus = "eaten" | "uneaten";

// A shop counts as "new" for one year after it opens.
const NEW_SHOP_WINDOW_DAYS = 365;

// Parses an ISO calendar date (YYYY-MM-DD) into a local-midnight dayjs value so
// comparisons happen at day granularity. Returns null for missing/invalid input.
// Shop date strings are parsed once at fetch time (see useShops); the status
// helpers below consume the cached openedAtDate/closedAtDate values to avoid
// reparsing the same strings on every render.
export function parseShopDate(value: string | undefined | null): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, DATE_FORMAT, true);
  return parsed.isValid() ? parsed.startOf("day") : null;
}

// Formats an ISO calendar date (YYYY-MM-DD) as a Japanese-style date for display.
export function formatShopDate(value: string | undefined): string | null {
  const parsed = parseShopDate(value);
  return parsed ? parsed.format("YYYY/M/D") : null;
}

export function shopLifecycleStatus(
  shop: Pick<Shop, "openedAtDate" | "closedAtDate">,
  now: Dayjs = dayjs(),
): ShopLifecycleStatus {
  const closedAtDate = shop.closedAtDate;
  const openedAtDate = shop.openedAtDate;
  if (closedAtDate !== null && !closedAtDate.isAfter(now, "day")) {
    return "closed";
  }
  if (openedAtDate !== null && openedAtDate.isAfter(now, "day")) {
    return "upcoming";
  }
  if (closedAtDate !== null && closedAtDate.isAfter(now, "day")) {
    return "closingSoon";
  }
  return "open";
}

export function shopRecencyStatus(
  shop: Pick<Shop, "openedAtDate" | "closedAtDate">,
  now: Dayjs = dayjs(),
): ShopRecencyStatus {
  if (shop.openedAtDate === null) {
    return "regular";
  }
  if (shop.openedAtDate.isAfter(now, "day")) {
    return "regular";
  }
  if (now.diff(shop.openedAtDate, "day") > NEW_SHOP_WINDOW_DAYS) {
    return "regular";
  }
  return shopLifecycleStatus(shop, now) === "closed" ? "regular" : "new";
}

export function shopEatenStatus(shop: Pick<Shop, "eaten">): ShopEatenStatus {
  return shop.eaten ? "eaten" : "uneaten";
}

export const SHOP_EATEN_STATUS_LABEL: Record<ShopEatenStatus, string> = {
  eaten: "食べた",
  uneaten: "気になる",
};

// System tags are auto-computed, virtual tags derived from a shop's lifecycle
// and recency status. Unlike user tags they are never stored (they would go
// stale, being date-relative) and are recomputed from dates. They share the
// `filters.tagIds` selection list with user tags (their slugs can't collide
// with user tag UUIDs), and they render in the same tag UI.
export type SystemTagSlug =
  | "system:open"
  | "system:new"
  | "system:upcoming"
  | "system:closingSoon"
  | "system:closed";

export interface SystemTagDef {
  slug: SystemTagSlug;
  label: string;
  color: string;
  // 営業店 is the unremarkable default state: it participates in filtering (so
  // ordinary shops stay visible while `閉店` defaults off and single states can
  // be spotlighted) but is not shown as a chip on shops.
  showOnShop: boolean;
}

export const SYSTEM_TAGS: SystemTagDef[] = [
  { slug: "system:new", label: "新店", color: "#8c2e21", showOnShop: true },
  {
    slug: "system:upcoming",
    label: "開店予定",
    color: "#8c7341",
    showOnShop: true,
  },
  {
    slug: "system:closingSoon",
    label: "閉店予定",
    color: "#6e2117",
    showOnShop: true,
  },
  { slug: "system:open", label: "営業店", color: "#6b7a3c", showOnShop: false },
  { slug: "system:closed", label: "閉店", color: "#1a1614", showOnShop: true },
];

const SYSTEM_TAG_SLUGS = new Set<string>(SYSTEM_TAGS.map((tag) => tag.slug));

export function isSystemTagSlug(id: string): boolean {
  return SYSTEM_TAG_SLUGS.has(id);
}

// Selected by default: everything except 閉店, so closed shops stay hidden until
// the user opts in (preserving the previous default behavior).
export const DEFAULT_SYSTEM_TAG_SELECTION: SystemTagSlug[] = SYSTEM_TAGS.filter(
  (tag) => tag.slug !== "system:closed",
).map((tag) => tag.slug);

// The system tag slugs a shop currently has: its single lifecycle status plus
// the orthogonal `new` flag.
export function shopSystemTagSlugs(
  shop: Pick<Shop, "lifecycleStatus" | "recencyStatus">,
): SystemTagSlug[] {
  const slugs: SystemTagSlug[] = [`system:${shop.lifecycleStatus}`];
  if (shop.recencyStatus === "new") {
    slugs.push("system:new");
  }
  return slugs;
}

// System tags shown as chips on a shop (excludes the default 営業中 state).
export function shopDisplaySystemTags(
  shop: Pick<Shop, "lifecycleStatus" | "recencyStatus">,
): SystemTagDef[] {
  const slugs = new Set<string>(shopSystemTagSlugs(shop));
  return SYSTEM_TAGS.filter((tag) => tag.showOnShop && slugs.has(tag.slug));
}
