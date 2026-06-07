import { components } from "@/generated/api.ts";

export type CategorySlug = components["schemas"]["CategorySlug"];

export type CategoryOption = {
  id: CategorySlug;
  label: string;
};

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: "ramen", label: "ラーメン" },
  { id: "udon", label: "うどん" },
];
