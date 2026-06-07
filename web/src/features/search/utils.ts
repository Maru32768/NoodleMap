import { Shop } from "@/features/shops/api/use-shops.ts";

export type CategoryType = "all" | "ramen" | "udon";

export type FilterToggles = {
  eaten: boolean;
  wish: boolean;
  closed: boolean;
  ramen: boolean;
  udon: boolean;
};

export type SearchFilters = FilterToggles & {
  favMin: number;
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
    const isClosed = r.closed;
    const isEaten = r.eaten && !r.closed;
    const isWish = !r.eaten && !r.closed;
    const statusMatch =
      (isClosed && filters.closed) ||
      (isEaten && filters.eaten) ||
      (isWish && filters.wish);
    if (!statusMatch) {
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
