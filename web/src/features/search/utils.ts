import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";

export function searchRestaurants(
  restaurants: Restaurant[],
  q: string,
  categories: string[],
  favoriteOnly: boolean,
  visited: boolean,
  unvisited: boolean,
) {
  const splitted = q.split(" ");

  return restaurants
    .filter((x) => {
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
    })
    .filter((x) => {
      let hit = false;
      for (const c of categories) {
        hit = hit || x.categories.includes(c);
      }
      return hit;
    })
    .filter((x) => {
      if (favoriteOnly) {
        return x.favorite;
      }
      return true;
    })
    .filter((x) => {
      if (!visited) {
        return !x.visited;
      }
      return true;
    })
    .filter((x) => {
      if (!unvisited) {
        return x.visited;
      }
      return true;
    });
}
