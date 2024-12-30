import { Restaurant } from "@/features/restaurants/api/useRestaurants.ts";

export function searchRestaurants(
  restaurants: Restaurant[],
  q: string,
  categories: string[],
) {
  const splitted = q.split(" ");

  const queryFiltered = restaurants.filter((x) => {
    if (q === "") {
      return true;
    }

    let hit = true;
    for (const s of splitted) {
      if (s === "") {
        continue;
      }
      const lowerS = s.toLowerCase();

      hit =
        (hit && x.name.toLowerCase().includes(lowerS)) ||
        x.address.toLowerCase().includes(lowerS);
    }

    return hit;
  });

  return queryFiltered.filter((x) => {
    let hit = false;
    for (const c of categories) {
      hit = hit || x.categories.includes(c);
    }
    return hit;
  });
}
