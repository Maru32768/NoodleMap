import { Shop } from "@/features/shops/api/use-shops.ts";
import {
  isSystemTagSlug,
  shopSystemTagSlugs,
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
  tagIds: string[];
};

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
  const q = query.trim().toLowerCase();

  return shops.filter((r) => {
    const visitMatch =
      (r.eatenStatus === "eaten" && filters.eaten) ||
      (r.eatenStatus === "uneaten" && filters.wish);
    if (!visitMatch) {
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

    if (q) {
      const hay = [r.name, r.address].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) {
        return false;
      }
    }

    return true;
  });
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
