import type { Shop } from "@/features/shops/api/use-shops.ts";

export type MealRecordFilter =
  | "all"
  | "eaten"
  | "wish"
  | "temporarilyClosed"
  | "closed";

/** 食べた / 行きたい hide closed shops; 閉店 and 臨時休業 show only them. */
export function matchesMealRecordFilter(
  shop: Pick<Shop, "eaten" | "lifecycleStatus" | "closureStatus">,
  filter: MealRecordFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "eaten":
      return shop.eaten && shop.lifecycleStatus !== "closed";
    case "wish":
      return !shop.eaten && shop.lifecycleStatus !== "closed";
    case "temporarilyClosed":
      return shop.closureStatus === "temporarilyClosed";
    case "closed":
      return shop.lifecycleStatus === "closed";
  }
}
