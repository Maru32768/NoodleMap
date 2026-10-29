import { CategoryBadge } from "@/components/category-badge.tsx";
import { CloseButton } from "@/components/ui/close-button.tsx";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { CategorySlug } from "@/features/categories/categories.ts";
import { CategoryIcon } from "@/features/map/category-icon.tsx";
import { ShopMealRecordHistory } from "@/features/meal-records/shop-meal-record-history.tsx";
import { ShopRating } from "@/features/meal-records/shop-rating.tsx";
import { Shop } from "@/features/shops/api/use-shops.ts";
import {
  buildGoogleMapsUrl,
  ShopActions,
  ShopAddressLink,
} from "@/features/shops/shop-actions.tsx";
import { ShopLinkList } from "@/features/shops/shop-link-list.tsx";
import {
  formatShopDate,
  shopDisplaySystemTags,
  ShopEatenStatus,
  shopStatusLabel,
} from "@/features/shops/status.ts";
import { SystemTagChips, TagChips } from "@/features/shops/tag-chips.tsx";
import { Box, Image } from "@chakra-ui/react";
import { useEffect, useEffectEvent, useState } from "react";

// The hero badge shows meal record status only; lifecycle/new are shown as system tag
// chips in the body.
const STATUS_TAG: Record<ShopEatenStatus, { bg: string; color: string }> = {
  eaten: { bg: "nm.matcha", color: "white" },
  uneaten: { bg: "nm.shu", color: "white" },
};

const HERO_BG: Record<CategorySlug, string> = {
  ramen:
    "repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.04) 14px 15px), linear-gradient(135deg, #d4946d, #8c4a2e)",
  udon: "repeating-linear-gradient(45deg, transparent 0 14px, rgba(0,0,0,0.04) 14px 15px), linear-gradient(135deg, #ddc99c, #8c7341)",
};

export interface DetailPanelProps {
  shop: Shop;
  onAdminEdit: (id: string) => void;
  onClose: () => void;
}

export function DetailPanel({ shop, onAdminEdit, onClose }: DetailPanelProps) {
  const currentUser = useCurrentUser();
  const showTags = currentUser.type === "admin" && shop.tags.length > 0;
  const mapsUrl = buildGoogleMapsUrl(shop);
  const heroBg = HERO_BG[shop.category];
  const onCloseEvent = useEffectEvent(() => {
    onClose();
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      onCloseEvent();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [failedCoverUrl, setFailedCoverUrl] = useState<string>();
  const coverUrl =
    shop.coverPhotoUrl !== failedCoverUrl ? shop.coverPhotoUrl : undefined;
  const closed = shop.lifecycleStatus === "closed";

  const status = shop.eatenStatus;
  const statusTag = {
    ...STATUS_TAG[status],
    label: shopStatusLabel(shop),
  };
  const displaySystemTags = shopDisplaySystemTags(shop);
  const hasTagsBelow = displaySystemTags.length > 0 || showTags;
  const openedAtLabel = formatShopDate(shop.openedAt);
  const closedAtLabel = formatShopDate(shop.closedAt);

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
              category={shop.category}
              closed={shop.lifecycleStatus === "closed"}
              size={64}
              color="var(--chakra-colors-nm-paper)"
              strokeWidth={1.4}
            />
          </Box>
        </Box>
        {coverUrl && (
          <Image
            src={coverUrl}
            alt={`${shop.name}の代表写真`}
            // Visible as soon as the panel opens.
            loading="eager"
            decoding="async"
            position="absolute"
            inset="0"
            w="100%"
            h="100%"
            objectFit="cover"
            // The category art greys out a closed shop; so does its photo.
            filter={closed ? "grayscale(1)" : undefined}
            opacity={closed ? 0.75 : 1}
            // A broken photo leaves the category art.
            onError={() => setFailedCoverUrl(coverUrl)}
          />
        )}
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
          as="h2"
          fontFamily="display"
          fontSize="1.5rem"
          fontWeight={700}
          color="nm.ink"
          lineHeight="1.25"
          letterSpacing="0.01em"
          mb="0.75rem"
        >
          {shop.name}
        </Box>

        <Box
          display="flex"
          alignItems="center"
          gap="0.625rem"
          fontSize="0.75rem"
          color="nm.inkMuted"
          mb={hasTagsBelow ? "0.75rem" : "1.125rem"}
        >
          <CategoryBadge catType={shop.category} />
        </Box>

        {displaySystemTags.length > 0 && (
          <Box mb="1.125rem">
            <SystemTagChips tags={displaySystemTags} />
          </Box>
        )}

        {showTags && (
          <Box mb="1.125rem">
            <TagChips tags={shop.tags} />
          </Box>
        )}

        {shop.eaten && (
          <Box
            bg="nm.bg"
            borderRadius="nmMd"
            px="1rem"
            py="0.875rem"
            mb="1.125rem"
          >
            <Box
              display="flex"
              alignItems="baseline"
              justifyContent="space-between"
              mb="0.5rem"
            >
              <Box
                fontFamily="mono"
                fontSize="0.625rem"
                letterSpacing="0.18em"
                color="nm.inkMuted"
                textTransform="uppercase"
              >
                お気に入り度 - Favorite
              </Box>
              <Box fontSize="0.75rem" color="nm.inkMuted">
                {shop.mealRecordCount}件の記録
              </Box>
            </Box>
            <ShopRating shop={shop} />
          </Box>
        )}

        <Box mb="1.375rem">
          {[
            {
              label: "Address",
              value: (
                <ShopAddressLink address={shop.address} mapsUrl={mapsUrl} />
              ),
            },
            ...(openedAtLabel
              ? [{ label: "Opened", value: openedAtLabel }]
              : []),
            ...(closedAtLabel
              ? [{ label: "Closed", value: closedAtLabel }]
              : []),
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

        <ShopLinkList links={shop.links} />

        {shop.eaten && (
          <Box mt="1.375rem">
            <ShopMealRecordHistory shopId={shop.id} />
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
        <ShopActions
          shop={shop}
          mapsUrl={mapsUrl}
          mapsLabel="Google Maps"
          onAdminClick={
            currentUser.type === "admin"
              ? () => onAdminEdit(shop.id)
              : undefined
          }
        />
      </Box>
    </Box>
  );
}
