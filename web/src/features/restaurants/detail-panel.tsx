import { CategoryBadge } from "@/components/category-badge.tsx";
import { CloseButton } from "@/components/ui/close-button.tsx";
import { Category } from "@/features/categories/api/use-categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { FavoriteRating } from "@/features/restaurants/rating-hearts.tsx";
import {
  RestaurantActions,
  RestaurantAddressLink,
  buildGoogleMapsUrl,
} from "@/features/restaurants/restaurant-actions.tsx";
import { getCategoryType } from "@/features/search/utils.ts";
import { Box } from "@chakra-ui/react";
import { useEffect } from "react";

const HERO_BG: Record<string, string> = {
  ramen:
    "repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.04) 14px 15px), linear-gradient(135deg, #d4946d, #8c4a2e)",
  udon: "repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.04) 14px 15px), linear-gradient(135deg, #ddc99c, #8c7341)",
  other:
    "repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.04) 14px 15px), linear-gradient(135deg, #d8c5a0, #b88947)",
};

export interface DetailPanelProps {
  restaurant: Restaurant;
  allCategories: Category[];
  onClose: () => void;
}

export function DetailPanel({
  restaurant: r,
  allCategories,
  onClose,
}: DetailPanelProps) {
  const catType = getCategoryType(r, allCategories);
  const mapsUrl = buildGoogleMapsUrl(r);
  const heroBg = HERO_BG[catType] ?? HERO_BG.ramen;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const statusTag = r.closed
    ? { label: "閉店", bg: "nm.ink", color: "nm.paper" }
    : r.visited
      ? { label: "訪問済", bg: "nm.matcha", color: "white" }
      : { label: "気になる", bg: "nm.shu", color: "white" };

  const noteBlock = r.closed
    ? {
        color: "nm.ink",
        label: "閉店",
        text: "残念ながら現在は営業を終了しています。",
      }
    : !r.visited
      ? {
          color: "nm.kincha",
          label: "未訪問",
          text: "まだ行っていない一杯。次の遠征リストへ。",
        }
      : null;

  return (
    <Box
      position="absolute"
      top="0.875rem"
      right="0.875rem"
      bottom="0.875rem"
      w="26.25rem"
      maxW="calc(100% - 1.75rem)"
      bg="nm.paper"
      borderRadius="nmLg"
      boxShadow="nmLg"
      zIndex={700}
      display={{ base: "none", md: "flex" }}
      flexDirection="column"
      overflow="hidden"
      animation="nm-detail-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)"
    >
      <CloseButton
        position="absolute"
        top="0.875rem"
        right="0.875rem"
        zIndex={10}
        w="32px"
        h="32px"
        minW="32px"
        minH="32px"
        p="0"
        bg="rgba(250, 246, 236, 0.9)"
        backdropFilter="blur(8px)"
        borderRadius="full"
        display="grid"
        placeItems="center"
        color="nm.ink"
        boxShadow="nmSm"
        _hover={{ bg: "nm.paper" }}
        onClick={onClose}
        aria-label="閉じる"
      />

      {/* Hero */}
      <Box
        h="220px"
        position="relative"
        overflow="hidden"
        flexShrink={0}
        bg="nm.bgSoft"
      >
        <Box
          position="absolute"
          inset="0"
          display="grid"
          placeItems="center"
          background={heroBg}
          fontFamily="mono"
          fontSize="0.6875rem"
          letterSpacing="0.15em"
          color="rgba(0,0,0,0.5)"
        >
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap="0.625rem"
            opacity={0.85}
          >
            <CategoryIcon
              category={catType}
              closed={r.closed}
              size={64}
              color="var(--chakra-colors-nm-paper)"
              strokeWidth={1.4}
            />
          </Box>
        </Box>
        <Box
          position="absolute"
          top="0.875rem"
          left="0.875rem"
          display="flex"
          gap="0.375rem"
        >
          <Box
            as="span"
            px="0.625rem"
            py="0.25rem"
            bg={statusTag.bg}
            color={statusTag.color}
            backdropFilter="blur(6px)"
            borderRadius="999px"
            fontSize="0.6875rem"
            fontWeight={600}
            display="flex"
            alignItems="center"
            gap="0.3125rem"
          >
            {statusTag.label}
          </Box>
        </Box>
      </Box>

      {/* Body */}
      <Box flex="1" overflowY="auto" px="1.625rem" pt="1.375rem" pb="5.625rem">
        <Box
          fontFamily="display"
          fontSize="1.5rem"
          fontWeight={700}
          color="nm.ink"
          lineHeight="1.25"
          letterSpacing="0.01em"
          mb="0.75rem"
        >
          {r.name}
        </Box>

        <Box
          display="flex"
          alignItems="center"
          gap="0.625rem"
          fontSize="0.75rem"
          color="nm.inkMuted"
          mb="1.125rem"
        >
          <CategoryBadge catType={catType} />
        </Box>

        {r.visited && (
          <Box
            bg="nm.bg"
            borderRadius="nmMd"
            px="1rem"
            py="0.875rem"
            mb="1.125rem"
          >
            <Box
              fontFamily="mono"
              fontSize="0.625rem"
              letterSpacing="0.18em"
              color="nm.inkMuted"
              textTransform="uppercase"
              mb="0.5rem"
            >
              お気に入り度 - Favorite
            </Box>
            <FavoriteRating rate={r.rate} />
          </Box>
        )}

        <Box mb="1.375rem">
          {[
            {
              label: "Address",
              value: (
                <RestaurantAddressLink address={r.address} mapsUrl={mapsUrl} />
              ),
            },
            {
              label: "Status",
              value: r.closed ? "閉店" : r.visited ? "訪問済み" : "気になる",
            },
          ].map(({ label, value }) => (
            <Box
              key={label}
              display="grid"
              gridTemplateColumns="5rem 1fr"
              gap="0.75rem"
              alignItems="start"
              fontSize="0.8125rem"
              py="0.625rem"
              borderBottom="1px dashed"
              borderBottomColor="nm.lineFaint"
            >
              <Box
                as="span"
                fontFamily="mono"
                fontSize="0.625rem"
                letterSpacing="0.15em"
                color="nm.inkMuted"
                textTransform="uppercase"
                pt="0.125rem"
              >
                {label}
              </Box>
              <Box as="span" color="nm.ink" lineHeight="1.55">
                {value}
              </Box>
            </Box>
          ))}
        </Box>

        {noteBlock && (
          <Box
            bg="linear-gradient(180deg, var(--chakra-colors-nm-bg) 0%, transparent 100%)"
            borderLeft="3px solid"
            borderLeftColor={noteBlock.color}
            px="1rem"
            py="0.875rem"
            borderRadius="0 nmMd nmMd 0"
            mb="1.125rem"
          >
            <Box
              fontFamily="display"
              fontSize="0.875rem"
              fontWeight={700}
              color={noteBlock.color}
              mb="0.375rem"
            >
              {noteBlock.label}
            </Box>
            <Box fontSize="0.84375rem" color="nm.inkSoft" lineHeight="1.75">
              {noteBlock.text}
            </Box>
          </Box>
        )}
      </Box>

      {/* Actions */}
      <Box
        position="absolute"
        bottom="0"
        left="0"
        right="0"
        background="linear-gradient(to top, var(--chakra-colors-nm-paper) 60%, transparent)"
        px="1.625rem"
        pt="0.875rem"
        pb="1.125rem"
        display="flex"
        gap="0.625rem"
      >
        <RestaurantActions mapsUrl={mapsUrl} mapsLabel="Google Maps" />
      </Box>
    </Box>
  );
}
