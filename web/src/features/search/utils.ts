import { Shop } from "@/features/shops/api/use-shops.ts";
import { isOpenAt } from "@/features/shops/business-hours.ts";
import {
  isSystemTagSlug,
  shopDisplaySystemTags,
  shopSystemTagSlugs,
  WISH_LEVELS,
  WishLevel,
} from "@/features/shops/status.ts";
import dayjs, { Dayjs } from "dayjs";

export type CategoryType = "all" | "ramen" | "udon";

export type FilterToggles = {
  // Meal record facet (OR within).
  eaten: boolean;
  wish: boolean;
  // Category facet (OR within).
  ramen: boolean;
  udon: boolean;
};

// Status (lifecycle + new) is filtered through `tagIds` as system tags, sharing
// the list with user tags. The two are evaluated as separate facets in
// filterShops because their empty-selection meaning differs (see below).
export type SearchFilters = FilterToggles & {
  favMin: number;
  // 駅徒歩 cap in minutes; 0 keeps every shop, including those with no station.
  walkMax: number;
  // 気になる度 levels kept among shops not eaten yet (OR within); empty keeps
  // every level. Eaten shops are not narrowed.
  wishLevels: WishLevel[];
  tagIds: string[];
  // 営業中 at this moment: null keeps every shop, "now" is the time of filtering,
  // otherwise a datetime-local value (YYYY-MM-DDTHH:mm). Never restored from storage.
  openAt: "now" | string | null;
};

/**
 * Narrows only shops not eaten yet, and only once a level is selected. An unset
 * 気になる度 counts as the middle level, 行きたい.
 */
export function matchesWishLevels(
  shop: Pick<Shop, "eatenStatus" | "wishLevel">,
  levels: readonly WishLevel[],
): boolean {
  if (levels.length === 0 || shop.eatenStatus === "eaten") {
    return true;
  }
  return levels.includes(shop.wishLevel ?? "medium");
}

/** Flips one level, keeping the result in {@link WISH_LEVELS} order. */
export function toggleWishLevel(
  levels: readonly WishLevel[],
  level: WishLevel,
): WishLevel[] {
  return WISH_LEVELS.filter((l) => (l === level) !== levels.includes(l));
}

// 不動産の表示に関する公正競争規約: 80 m per minute, any remainder rounded up.
export function walkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.ceil(distanceMeters / 80));
}

/** 「渋谷駅 徒歩5分」, or null when no station is within reach. */
export function stationLabel(
  shop: Pick<Shop, "nearestStation">,
): string | null {
  const station = shop.nearestStation;
  return station
    ? `${station.name}駅 徒歩${walkMinutes(station.distanceMeters)}分`
    : null;
}

export function favToHearts(rate: number | undefined): number {
  if (!rate || rate <= 0) {
    return 0;
  }
  return Math.min(5, rate / 20);
}

function distanceKm(
  r: { lat: number; lng: number },
  center: { lat: number; lng: number },
): number {
  const dLat = (r.lat - center.lat) * 111;
  const dLng = (r.lng - center.lng) * 91;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function filterShops(
  shops: Shop[],
  opts: {
    query: string;
    filters: SearchFilters;
    // What "now" means for openAt; the caller advances it so the list follows the clock.
    now?: Dayjs;
  },
): Shop[] {
  const { query, filters, now = dayjs() } = opts;
  const matchesQuery = createQueryMatcher(query);
  const openAt =
    filters.openAt === null
      ? null
      : filters.openAt === "now"
        ? now
        : dayjs(filters.openAt);

  return shops.filter((r) => {
    // Only shops known to be 営業中; 不定休 and unknown hours drop out.
    if (openAt && !isOpenAt(r, openAt)) {
      return false;
    }

    const mealRecordMatch =
      (r.eatenStatus === "eaten" && filters.eaten) ||
      (r.eatenStatus === "uneaten" && filters.wish);
    if (!mealRecordMatch || !matchesWishLevels(r, filters.wishLevels)) {
      return false;
    }

    const categoryMatch =
      (r.category === "ramen" && filters.ramen) ||
      (r.category === "udon" && filters.udon);
    if (!categoryMatch) {
      return false;
    }

    if (filters.favMin > 0 && (r.rate ?? 0) < filters.favMin) {
      return false;
    }

    if (
      filters.walkMax > 0 &&
      (!r.nearestStation ||
        walkMinutes(r.nearestStation.distanceMeters) > filters.walkMax)
    ) {
      return false;
    }

    // System-tag (status) facet: a chip turned off hides every shop showing it.
    // 営業店 is not shown on shops, so it only keeps ordinary shops (showing no
    // chip) visible, and turning everything but one chip off spotlights that
    // state. Deselecting all status chips intentionally shows nothing.
    const systemMatch =
      shopDisplaySystemTags(r).every((tag) =>
        filters.tagIds.includes(tag.slug),
      ) && shopSystemTagSlugs(r).some((slug) => filters.tagIds.includes(slug));
    if (!systemMatch) {
      return false;
    }

    // User-tag facet: empty selection means no narrowing (unlike the system
    // facet above), so the two cannot be a single OR over the whole list.
    const selectedUserTagIds = filters.tagIds.filter(
      (id) => !isSystemTagSlug(id),
    );
    if (selectedUserTagIds.length > 0) {
      const shopTagIds = new Set(r.tags.map((tag) => tag.id));
      if (!selectedUserTagIds.some((tagId) => shopTagIds.has(tagId))) {
        return false;
      }
    }

    return matchesQuery(r);
  });
}

// NFKC folds half-width kana and full-width ASCII; katakana is then mapped to
// hiragana so 「ラーメン」, 「ﾗｰﾒﾝ」 and 「らーめん」 all compare equal.
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// Free-text match over name, reading (読み), address, nearest station and tag labels. The query
// is split on whitespace; every token must appear within a single field, but
// different tokens may match different fields (「中華そば 新宿」).
export function createQueryMatcher(query: string): (shop: Shop) => boolean {
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return () => true;
  }
  return (shop) => {
    const fields = [
      shop.name,
      shop.nameKana,
      shop.address,
      // With the 駅 suffix, so 「渋谷」 and 「渋谷駅」 both match.
      shop.nearestStation && `${shop.nearestStation.name}駅`,
      ...shop.tags.map((tag) => tag.label),
    ]
      .filter((field) => field !== undefined)
      .map(normalizeForSearch);
    return tokens.every((token) =>
      fields.some((field) => field.includes(token)),
    );
  };
}

export function sortShops(
  shops: Shop[],
  mapCenter: { lat: number; lng: number },
): Shop[] {
  return [...shops].sort((a, b) => {
    const dA = distanceKm(a, mapCenter);
    const dB = distanceKm(b, mapCenter);
    if (Math.abs(dA - dB) > 1.0) {
      return dA - dB;
    }
    return (b.rate ?? 0) - (a.rate ?? 0);
  });
}
