import { Shop } from "@/features/shops/api/use-shops.ts";
import { FavoriteRating } from "@/features/shops/rating-hearts.tsx";
import { Box } from "@chakra-ui/react";

/** A shop's own お気に入り度, or 未設定. */
export function ShopRating({
  shop,
  compact,
}: {
  shop: Pick<Shop, "rate">;
  compact?: boolean;
}) {
  if (shop.rate === undefined) {
    return (
      <Box fontSize="0.8125rem" color="nm.inkMuted">
        未設定
      </Box>
    );
  }
  return <FavoriteRating rate={shop.rate} compact={compact} />;
}
