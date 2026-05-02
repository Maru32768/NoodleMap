import { Category } from "@/features/categories/api/use-categories.ts";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";

export type CategoryType = "all" | "ramen" | "udon";
export type VisitState = "all" | "visited" | "wish";
export type ClosedState = "all" | "hide";

export function getCategoryType(
  r: Restaurant,
  allCategories: Category[],
): "ramen" | "udon" | "other" {
  const matched = allCategories.filter((c) => r.categories.includes(c.id));
  for (const c of matched) {
    if (c.label.includes("うどん") || c.label.toLowerCase().includes("udon")) {
      return "udon";
    }
    if (
      c.label.includes("ラーメン") ||
      c.label.toLowerCase().includes("ramen")
    ) {
      return "ramen";
    }
  }
  return "ramen";
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

export function filterRestaurants(
  restaurants: Restaurant[],
  allCategories: Category[],
  opts: {
    query: string;
    categoryType: CategoryType;
    visitState: VisitState;
    closedState: ClosedState;
    favMin: number;
  },
): Restaurant[] {
  const { query, categoryType, visitState, closedState, favMin } = opts;
  const q = query.trim().toLowerCase();

  return restaurants.filter((r) => {
    if (categoryType !== "all") {
      const ct = getCategoryType(r, allCategories);
      if (ct !== categoryType) {
        return false;
      }
    }
    if (visitState === "visited" && !r.visited) {
      return false;
    }
    if (visitState === "wish" && (r.visited || r.closed)) {
      return false;
    }
    if (closedState === "hide" && r.closed) {
      return false;
    }
    if (favMin > 0 && (r.rate ?? 0) < favMin) {
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
