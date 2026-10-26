import { useMealRecords } from "@/features/meal-records/api/use-meal-records.ts";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { FavoriteRating } from "@/features/shops/rating-hearts.tsx";
import { Box } from "@chakra-ui/react";

/** An eaten shop's お気に入り度 (from its latest rated mealRecord), or 未設定 when no mealRecord has one. */
export function ShopRating({
  shop,
  compact,
}: {
  shop: Pick<Shop, "id" | "rate">;
  compact?: boolean;
}) {
  const { mealRecords } = useMealRecords(shop.id);
  // The shop's rate is 0 both for a real 0 and for no rated meal record; the meal records
  // tell them apart once loaded.
  const rated = mealRecords
    ? mealRecords.some((mealRecord) => mealRecord.rate !== undefined)
    : shop.rate > 0;

  if (!rated) {
    return (
      <Box fontSize="0.8125rem" color="nm.inkMuted">
        未設定
      </Box>
    );
  }
  return <FavoriteRating rate={shop.rate} compact={compact} />;
}
