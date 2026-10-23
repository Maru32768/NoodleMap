import { Shop } from "@/features/shops/api/use-shops.ts";
import { FavoriteRating } from "@/features/shops/rating-hearts.tsx";
import { useVisits } from "@/features/visits/api/use-visits.ts";
import { Box } from "@chakra-ui/react";

/** An eaten shop's お気に入り度 (from its latest rated visit), or 未設定 when no visit has one. */
export function ShopRating({
  shop,
  compact,
}: {
  shop: Pick<Shop, "id" | "rate">;
  compact?: boolean;
}) {
  const { visits } = useVisits(shop.id);
  // The shop's rate is 0 both for a real 0 and for no rated visit; the visits
  // tell them apart once loaded.
  const rated = visits
    ? visits.some((visit) => visit.rate !== undefined)
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
