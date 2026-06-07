import { CategorySlug } from "@/features/categories/categories.ts";
import { Box } from "@chakra-ui/react";

export function CategoryBadge({ catType }: { catType: CategorySlug }) {
  const bg = catType === "udon" ? "nm.kincha" : "nm.shu";

  return (
    <Box
      as="span"
      fontFamily="mono"
      fontSize="0.625rem"
      letterSpacing="0.15em"
      px="0.5rem"
      py="0.1875rem"
      bg={bg}
      borderRadius="nmSm"
      textTransform="uppercase"
      color="white"
    >
      {catType === "udon" ? "UDON" : "RAMEN"}
    </Box>
  );
}
