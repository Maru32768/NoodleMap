import { Button } from "@/components/ui/button.tsx";
import { Tag } from "@/features/shops/api/use-shops.ts";
import { SystemTagDef } from "@/features/shops/status.ts";
import { Box } from "@chakra-ui/react";

export function getTagTextColor(color: string) {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (hex.length !== 6) {
    return "white";
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "nm.ink" : "white";
}

export function TagChips({
  tags,
  limit,
  size = "sm",
}: {
  tags: Tag[];
  limit?: number;
  size?: "xs" | "sm";
}) {
  if (tags.length === 0) {
    return null;
  }

  const visibleTags = limit ? tags.slice(0, limit) : tags;
  const rest = limit ? tags.length - visibleTags.length : 0;

  return (
    <Box display="flex" flexWrap="wrap" gap={size === "xs" ? "4px" : "6px"}>
      {visibleTags.map((tag) => (
        <Box
          key={tag.id}
          as="span"
          display="inline-flex"
          alignItems="center"
          gap="5px"
          minH={size === "xs" ? "18px" : "22px"}
          px={size === "xs" ? "6px" : "8px"}
          py="1px"
          borderRadius="999px"
          bg={tag.color}
          color={getTagTextColor(tag.color)}
          fontSize={size === "xs" ? "10px" : "11px"}
          fontWeight={600}
          lineHeight="1"
          whiteSpace="nowrap"
        >
          {tag.label}
        </Box>
      ))}
      {rest > 0 && (
        <Box
          as="span"
          display="inline-flex"
          alignItems="center"
          minH={size === "xs" ? "18px" : "22px"}
          px={size === "xs" ? "6px" : "8px"}
          borderRadius="999px"
          bg="nm.bg"
          color="nm.inkMuted"
          fontSize={size === "xs" ? "10px" : "11px"}
          fontFamily="mono"
        >
          +{rest}
        </Box>
      )}
    </Box>
  );
}

// Read-only chips for a shop's auto-computed system tags. Visually distinguished
// from user tags (dashed outline + sparkle marker) to signal they are automatic.
export function SystemTagChips({
  tags,
  size = "sm",
}: {
  tags: SystemTagDef[];
  size?: "xs" | "sm";
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <Box display="flex" flexWrap="wrap" gap={size === "xs" ? "4px" : "6px"}>
      {tags.map((tag) => (
        <Box
          key={tag.slug}
          as="span"
          display="inline-flex"
          alignItems="center"
          gap="4px"
          minH={size === "xs" ? "18px" : "22px"}
          px={size === "xs" ? "6px" : "8px"}
          py="1px"
          borderRadius="999px"
          border="1px dashed"
          borderColor={tag.color}
          color={tag.color}
          fontSize={size === "xs" ? "10px" : "11px"}
          fontWeight={600}
          lineHeight="1"
          whiteSpace="nowrap"
        >
          <Box
            as="span"
            w={size === "xs" ? "8px" : "9px"}
            h={size === "xs" ? "8px" : "9px"}
            flexShrink={0}
            display="grid"
            placeItems="center"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              width="100%"
              height="100%"
            >
              <path d="M12 2l2.2 6.2L20 10l-5.8 1.8L12 18l-2.2-6.2L4 10l5.8-1.8z" />
            </svg>
          </Box>
          {tag.label}
        </Box>
      ))}
    </Box>
  );
}

export function TagSelector({
  tags,
  selectedIds,
  category,
  onChange,
}: {
  tags: Tag[];
  selectedIds: string[];
  category?: Tag["category"];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);
  const visibleTags = category
    ? tags.filter((tag) => !tag.category || tag.category === category)
    : tags;

  return (
    <Box display="flex" flexWrap="wrap" gap="6px">
      {visibleTags.map((tag) => {
        const active = selected.has(tag.id);
        return (
          <Button
            key={tag.id}
            variant="plain"
            display="inline-flex"
            alignItems="center"
            gap="7px"
            minW="auto"
            minH="auto"
            h="auto"
            px="9px"
            py="6px"
            border="1px solid"
            borderColor={active ? tag.color : "nm.line"}
            borderRadius="999px"
            bg={active ? tag.color : "nm.bg"}
            color={active ? getTagTextColor(tag.color) : "nm.inkMuted"}
            fontSize="12px"
            fontWeight={active ? 600 : 500}
            _hover={{
              borderColor: tag.color,
              color: active ? getTagTextColor(tag.color) : "nm.ink",
            }}
            onClick={() => {
              if (active) {
                onChange(selectedIds.filter((id) => id !== tag.id));
                return;
              }
              onChange([...selectedIds, tag.id]);
            }}
          >
            <Box
              as="span"
              boxSize="8px"
              borderRadius="full"
              bg={active ? "currentColor" : tag.color}
              opacity={active ? 0.9 : 1}
              flexShrink={0}
            />
            {tag.label}
          </Button>
        );
      })}
    </Box>
  );
}
