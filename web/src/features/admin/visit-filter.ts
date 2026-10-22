import type { Shop } from "@/features/shops/api/use-shops.ts";

export type VisitFilter = "all" | "eaten" | "wish" | "closed";

/** 食べた / 行きたい hide closed shops; 閉店 shows only them. */
export function matchesVisitFilter(
  shop: Pick<Shop, "eaten" | "lifecycleStatus">,
  filter: VisitFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "eaten":
      return shop.eaten && shop.lifecycleStatus !== "closed";
    case "wish":
      return !shop.eaten && shop.lifecycleStatus !== "closed";
    case "closed":
      return shop.lifecycleStatus === "closed";
  }
}
