import { Category } from "@/features/categories/api/use-categories.ts";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { favToHearts, getCategoryType } from "@/features/search/utils.ts";
import { Box } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

interface MobileShopListProps {
  shops: Restaurant[];
  categories: Category[];
  selectedId: string | null;
  onEdit: (id: string) => void;
}

function MiniHearts({ rate }: { rate: number | undefined }) {
  const n = favToHearts(rate);
  return (
    <Box as="span" display="inline-flex" gap="1px">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          fill="currentColor"
          width="11"
          height="11"
          style={{
            color:
              i <= n
                ? "var(--chakra-colors-nm-shu)"
                : "var(--chakra-colors-nm-inkFaint)",
            opacity: i <= n ? 1 : 0.35,
          }}
        >
          <path d="M12 21s-7-4.35-9.5-9C1 8.5 3 5 6.5 5 8.5 5 10.5 6 12 8c1.5-2 3.5-3 5.5-3C21 5 23 8.5 21.5 12 19 16.65 12 21 12 21z" />
        </svg>
      ))}
    </Box>
  );
}

const THUMB_BG: Record<string, string> = {
  ramen: "linear-gradient(135deg, #d4946d, #8c4a2e)",
  udon: "linear-gradient(135deg, #ddc99c, #8c7341)",
  other: "linear-gradient(135deg, #d8c5a0, #b88947)",
};

const PILL: Record<string, { bg: string; color: string; label: string }> = {
  closed: { bg: "nm.ink", color: "nm.paper", label: "閉店" },
  visited: { bg: "nm.matcha", color: "white", label: "食べた" },
  unvisited: { bg: "nm.bg", color: "nm.inkMuted", label: "気になる" },
};

function MobileShopListItem({
  shop,
  categories,
  selected,
  onEdit,
}: {
  shop: Restaurant;
  categories: Category[];
  selected: boolean;
  onEdit: (id: string) => void;
}) {
  const catType = getCategoryType(shop, categories);
  const catLabel =
    catType === "udon" ? "うどん" : catType === "ramen" ? "ラーメン" : "その他";
  const pillKey = shop.closed
    ? "closed"
    : shop.visited
      ? "visited"
      : "unvisited";
  const pill = PILL[pillKey];

  return (
    <Box
      display="flex"
      gap="12px"
      alignItems="flex-start"
      px="14px"
      py="12px"
      borderBottom="1px solid"
      borderBottomColor="nm.lineFaint"
      cursor="pointer"
      opacity={shop.closed ? 0.6 : 1}
      transition="background 0.1s"
      bg={selected ? "nm.bg" : undefined}
      _hover={{ bg: "nm.bg" }}
      _active={{ bg: "nm.bgSoft" }}
      onClick={() => onEdit(shop.id)}
    >
      {/* Thumb */}
      <Box
        w="48px"
        h="48px"
        borderRadius="nmMd"
        flexShrink={0}
        background={THUMB_BG[catType] ?? THUMB_BG.other}
        display="grid"
        placeItems="center"
        fontFamily="display"
        fontSize="18px"
        color="rgba(255,255,255,0.9)"
      >
        {catType === "udon" ? "饂" : "麺"}
      </Box>

      {/* Info */}
      <Box flex="1" minW="0">
        <Box
          fontWeight={600}
          fontSize="14px"
          color="nm.ink"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {shop.name}
        </Box>
        <Box
          display="flex"
          alignItems="center"
          gap="6px"
          mt="3px"
          fontSize="11px"
          color="nm.inkMuted"
        >
          <Box as="span">{catLabel}</Box>
          <Box
            as="span"
            w="3px"
            h="3px"
            borderRadius="full"
            bg="nm.inkFaint"
            flexShrink={0}
          />
          {shop.visited ? (
            <MiniHearts rate={shop.rate} />
          ) : (
            <Box as="span" color="nm.inkFaint">
              気になる
            </Box>
          )}
        </Box>
        <Box
          mt="2px"
          fontSize="11px"
          color="nm.inkMuted"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {shop.address}
        </Box>
        <Box mt="5px">
          <Box
            as="span"
            display="inline-block"
            px="7px"
            py="2px"
            bg={pill.bg}
            color={pill.color}
            borderRadius="nmSm"
            fontSize="10px"
            fontFamily="mono"
            letterSpacing="0.08em"
          >
            {pill.label}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function MobileShopList({
  shops,
  categories,
  selectedId,
  onEdit,
}: MobileShopListProps) {
  const listRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const selectedIndex = shops.findIndex((shop) => shop.id === selectedId);
    if (selectedIndex === -1) {
      return;
    }

    listRef.current?.scrollToIndex({
      index: selectedIndex,
      align: "center",
      behavior: "smooth",
    });
  }, [selectedId, shops]);

  return (
    <Box h="100%">
      {shops.length === 0 && (
        <Box
          display="grid"
          placeItems="center"
          h="160px"
          color="nm.inkFaint"
          fontSize="13px"
        >
          該当する店舗がありません
        </Box>
      )}
      {shops.length > 0 && (
        <Virtuoso
          ref={listRef}
          style={{ height: "100%" }}
          data={shops}
          itemContent={(_, shop) => (
            <MobileShopListItem
              shop={shop}
              categories={categories}
              selected={shop.id === selectedId}
              onEdit={onEdit}
            />
          )}
        />
      )}
    </Box>
  );
}
