import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";

export type CategoryType = "all" | "ramen" | "udon";

export type FilterToggles = {
  visited: boolean;
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

export function filterRestaurants(
  restaurants: Restaurant[],
  opts: {
    query: string;
    filters: SearchFilters;
  },
): Restaurant[] {
  const { query, filters } = opts;
  const q = query.trim().toLowerCase();

  return restaurants.filter((r) => {
    const isClosed = r.closed;
    const isVisited = r.visited && !r.closed;
    const isWish = !r.visited && !r.closed;
    const statusMatch =
      (isClosed && filters.closed) ||
      (isVisited && filters.visited) ||
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

export function sortRestaurants(
  restaurants: Restaurant[],
  mapCenter: { lat: number; lng: number },
): Restaurant[] {
  return [...restaurants].sort((a, b) => {
    const dA = distanceKm(a, mapCenter);
    const dB = distanceKm(b, mapCenter);
    if (Math.abs(dA - dB) > 1.0) {
      return dA - dB;
    }
    return (b.rate ?? 0) - (a.rate ?? 0);
  });
}
