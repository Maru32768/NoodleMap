import { Box } from "@chakra-ui/react";

export function CategoryBadge({
  catType,
}: {
  catType: "ramen" | "udon" | "other";
}) {
  const bg =
    catType === "ramen"
      ? "nm.shu"
      : catType === "udon"
        ? "nm.kincha"
        : "nm.bgSoft";
  const color = catType === "other" ? "nm.inkSoft" : "white";

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
      color={color}
    >
      {catType === "udon" ? "UDON" : "RAMEN"}
    </Box>
  );
}
