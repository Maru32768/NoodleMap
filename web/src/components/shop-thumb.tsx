import { CategorySlug } from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { Box } from "@chakra-ui/react";

const THUMB_BG: Record<CategorySlug | "closed", string> = {
  ramen: "linear-gradient(135deg, #e8d5b7, #c9a06a)",
  udon: "linear-gradient(135deg, #ede5cf, #b8a87a)",
  closed: "#d4cdc0",
};

interface ShopThumbProps {
  catType: CategorySlug;
  closed: boolean;
  size?: "md" | "lg";
}

export function ShopThumb({ catType, closed, size = "md" }: ShopThumbProps) {
  const dim = size === "lg" ? "64px" : "56px";
  const iconSize = size === "lg" ? 36 : 28;
  const bg = closed ? THUMB_BG.closed : THUMB_BG[catType];

  return (
    <Box
      w={dim}
      h={dim}
      borderRadius="nmMd"
      flexShrink={0}
      overflow="hidden"
      background={bg}
      display="grid"
      placeItems="center"
    >
      <CategoryIcon
        category={catType}
        closed={closed}
        size={iconSize}
        color={
          closed ? "rgba(255,255,255,0.85)" : "var(--chakra-colors-nm-paper)"
        }
      />
    </Box>
  );
}
