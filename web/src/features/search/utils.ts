import { Shop } from "@/features/shops/api/use-shops.ts";
import {
  isSystemTagSlug,
  shopSystemTagSlugs,
  WISH_LEVELS,
  WishLevel,
} from "@/features/shops/status.ts";

export type CategoryType = "all" | "ramen" | "udon";

export type FilterToggles = {
  // Visit facet (OR within).
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
  // 気になる度 floor for shops not eaten yet; eaten shops are not narrowed.
  wishMin: WishFilter;
  tagIds: string[];
};

export type WishFilter = "all" | WishLevel;

export const WISH_FILTER_OPTIONS: readonly {
  value: WishFilter;
  label: string;
}[] = [
  { value: "all", label: "すべて" },
  { value: "low", label: "ちょっと気になる以上" },
  { value: "medium", label: "気になる以上" },
  { value: "high", label: "絶対行きたいのみ" },
];

export function isWishFilter(value: unknown): value is WishFilter {
  return WISH_FILTER_OPTIONS.some((option) => option.value === value);
}

/**
 * Narrows only shops not eaten yet. An unset 気になる度 ranks as 気になる, the
 * label such a shop shows.
 */
export function matchesWishFilter(
  shop: Pick<Shop, "eatenStatus" | "wishLevel">,
  filter: WishFilter,
): boolean {
  if (filter === "all" || shop.eatenStatus === "eaten") {
    return true;
  }
  const level = shop.wishLevel ?? "medium";
  return WISH_LEVELS.indexOf(level) >= WISH_LEVELS.indexOf(filter);
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
  },
): Shop[] {
  const { query, filters } = opts;
  const matchesQuery = createQueryMatcher(query);

  return shops.filter((r) => {
    const visitMatch =
      (r.eatenStatus === "eaten" && filters.eaten) ||
      (r.eatenStatus === "uneaten" && filters.wish);
    if (!visitMatch || !matchesWishFilter(r, filters.wishMin)) {
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

    // System-tag (status) facet: lifecycle is exhaustive, so a shop must match a
    // selected system tag. Deselecting all status chips intentionally shows
    // nothing. The `system:open` receiver keeps ordinary shops visible while
    // `閉店` defaults off and single states can be spotlighted.
    const systemMatch = shopSystemTagSlugs(r).some((slug) =>
      filters.tagIds.includes(slug),
    );
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

// Free-text match over name, reading (読み), address and tag labels. The query
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
