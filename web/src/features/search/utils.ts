import { Restaurant } from "@/features/restaurants/api/useRestaurants.ts";

export function searchRestaurants(restaurants: Restaurant[], q: string) {
  const splitted = splitQuery(q);
  if (!splitted) {
    return restaurants;
  }

  return restaurants.filter((x) => {
    for (const s of splitted) {
      const sLowerCase = s.toLowerCase();
      if (x.name.toLowerCase().includes(sLowerCase)) {
        return true;
      }

      if (x.address.toLowerCase().includes(sLowerCase)) {
        return true;
      }
    }

    return false;
  });
}

function splitQuery(q: string) {
  // TODO Consider double quotes
  return q.split(" ");
}
