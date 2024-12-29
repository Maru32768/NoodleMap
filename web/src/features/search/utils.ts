import { Restaurant } from "@/features/restaurants/api/useRestaurants.ts";

export function searchRestaurants(restaurants: Restaurant[], q: string) {
  if (q === "") {
    return restaurants;
  }
  const splitted = q.split(" ");

  return restaurants.filter((x) => {
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
}
