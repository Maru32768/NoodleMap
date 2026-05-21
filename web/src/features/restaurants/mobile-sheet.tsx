import { CategoryBadge } from "@/components/category-badge.tsx";
import { ShopThumb } from "@/components/shop-thumb.tsx";
import { CloseButton } from "@/components/ui/close-button.tsx";
import { Category } from "@/features/categories/api/use-categories.ts";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import {
  FavoriteRating,
  MiniHearts,
} from "@/features/restaurants/rating-hearts.tsx";
import {
  RestaurantActions,
  RestaurantAddressLink,
  buildGoogleMapsUrl,
} from "@/features/restaurants/restaurant-actions.tsx";
import { getCategoryType } from "@/features/search/utils.ts";
import { useIsPc } from "@/utils/use-is-pc.ts";
import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { Sheet, type SheetRef } from "react-modal-sheet";
import { Virtuoso } from "react-virtuoso";

type MobileSheetLevel = "peek" | "full";

export interface MobileSheetProps {
  shop: Restaurant | undefined;
  sortedRestaurants: Restaurant[];
  allCategories: Category[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

// Index 0 = pseudo-close (redirected back to peek), index 1 = peek, index 2 = full.
// Peek heights are clamped so short and tall screens stay usable.
const LIST_PEEK = { minPx: 104, ratio: 0.14, maxPx: 132 };
const DETAIL_PEEK = { minPx: 132, ratio: 0.205, maxPx: 144 };
const LEVEL_TO_SNAP: Record<MobileSheetLevel, number> = {
  peek: 1,
  full: 2,
};
const SNAP_TO_LEVEL: Record<number, MobileSheetLevel> = {
  1: "peek",
  2: "full",
  3: "full",
};

function getPeekRatio(
  viewportHeight: number,
  config: { minPx: number; ratio: number; maxPx: number },
) {
  if (viewportHeight <= 0) {
    return config.ratio;
  }
  const height = Math.min(
    config.maxPx,
    Math.max(config.minPx, viewportHeight * config.ratio),
  );
  return height / viewportHeight;
}

function MobileListItem({
  restaurant,
  allCategories,
  onClick,
}: {
  restaurant: Restaurant;
  allCategories: Category[];
  onClick: () => void;
}) {
  const catType = getCategoryType(restaurant, allCategories);

  return (
    <Box
      display="flex"
      gap="0.75rem"
      px="1.125rem"
      py="0.75rem"
      borderBottom="1px solid"
      borderBottomColor="nm.lineFaint"
      opacity={restaurant.closed ? 0.55 : 1}
      cursor="pointer"
      _active={{ bg: "nm.bg" }}
      onClick={onClick}
    >
      <ShopThumb catType={catType} closed={restaurant.closed} size="md" />
      <Box flex="1" minWidth="0">
        <Box
          fontSize="0.875rem"
          fontWeight={600}
          color="nm.ink"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {restaurant.name}
        </Box>
        <Box fontSize="0.6875rem" color="nm.inkMuted" mt="0.125rem">
          {catType === "udon" ? "うどん" : "ラーメン"} ·{" "}
          {restaurant.address.slice(0, 14)}...
        </Box>
        {restaurant.visited && !restaurant.closed && (
          <Box mt="0.1875rem">
            <MiniHearts rate={restaurant.rate} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function MobileSheet({
  shop,
  sortedRestaurants,
  allCategories,
  onSelect,
  onClose,
}: MobileSheetProps) {
  const isPc = useIsPc();
  const sheetRef = useRef<SheetRef>(null);
  const catType = shop ? getCategoryType(shop, allCategories) : "ramen";
  const mapsUrl = shop ? buildGoogleMapsUrl(shop) : "";
  const [level, setLevel] = useState<MobileSheetLevel>("peek");
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const detailsVisible = level !== "peek";

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleClose = () => {
    setLevel("peek");
    onClose();
  };

  // Snap back to peek whenever switching between list ↔ detail mode.
  const isDetailMode = Boolean(shop);
  useEffect(() => {
    setLevel("peek");
    sheetRef.current?.snapTo(LEVEL_TO_SNAP.peek);
  }, [isDetailMode]);

  const snapPoints = shop
    ? [0, getPeekRatio(viewportHeight, DETAIL_PEEK), 0.88, 1]
    : [0, getPeekRatio(viewportHeight, LIST_PEEK), 0.88, 1];

  return (
    <Sheet
      key={shop ? "detail" : "list"}
      ref={sheetRef}
      isOpen={!isPc}
      snapPoints={snapPoints}
      onClose={() => {
        // Sheet is never truly closed. If in detail mode, go back to list.
        if (shop) {
          handleClose();
        }
        sheetRef.current?.snapTo(LEVEL_TO_SNAP.peek);
      }}
      initialSnap={LEVEL_TO_SNAP.peek}
      onSnap={(snapIndex) => {
        // Always redirect snap-to-close back to peek (sheet is never dismissed).
        if (snapIndex === 0) {
          if (shop) {
            handleClose();
          }
          sheetRef.current?.snapTo(LEVEL_TO_SNAP.peek);
          return;
        }
        const nextLevel = SNAP_TO_LEVEL[snapIndex];
        if (nextLevel) {
          setLevel(nextLevel);
          // Clamp library's auto-added 4th snap back to full.
          if (snapIndex > LEVEL_TO_SNAP.full) {
            requestAnimationFrame(() => {
              sheetRef.current?.snapTo(LEVEL_TO_SNAP.full);
            });
          }
        }
      }}
      tweenConfig={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.28 }}
      dragVelocityThreshold={500}
      disableScrollLocking
      style={{ zIndex: 800 }}
    >
      <Sheet.Container
        style={{
          backgroundColor: "var(--chakra-colors-nm-paper)",
          borderTopLeftRadius: "var(--chakra-radii-nmLg)",
          borderTopRightRadius: "var(--chakra-radii-nmLg)",
          boxShadow: "0 -10px 40px rgba(26,22,20,0.18)",
          overflow: "hidden",
        }}
      >
        <Sheet.Header>
          <Box display="flex" justifyContent="center" py="0.5rem" pb="0.25rem">
            <Box w="36px" h="4px" bg="nm.inkFaint" borderRadius="2px" />
          </Box>
        </Sheet.Header>

        <Sheet.Content
          disableScroll={(state) => state.currentSnap !== LEVEL_TO_SNAP.full}
          disableDrag={(state) =>
            state.currentSnap === LEVEL_TO_SNAP.full &&
            (state.scrollPosition === "middle" ||
              state.scrollPosition === "bottom")
          }
        >
          {shop ? (
            <Box
              px="1.125rem"
              pb="calc(1.125rem + env(safe-area-inset-bottom, 0px))"
            >
              {/* Header row */}
              <Box display="flex" gap="0.75rem" alignItems="flex-start">
                <ShopThumb catType={catType} closed={shop.closed} size="lg" />

                <Box flex="1" minWidth="0">
                  <Box
                    fontFamily="display"
                    fontSize="1.125rem"
                    fontWeight={700}
                    lineHeight="1.3"
                    color="nm.ink"
                  >
                    {shop.name}
                  </Box>
                  <Box fontSize="0.6875rem" color="nm.inkMuted" mt="0.25rem">
                    <CategoryBadge catType={catType} />
                    <Box as="span" ml="0.5rem">
                      <RestaurantAddressLink
                        address={shop.address}
                        mapsUrl={mapsUrl}
                      />
                    </Box>
                  </Box>
                  {shop.visited && !shop.closed && (
                    <Box mt="0.375rem">
                      <MiniHearts rate={shop.rate} />
                    </Box>
                  )}
                </Box>

                <CloseButton
                  w="30px"
                  h="30px"
                  minW="30px"
                  minH="30px"
                  p="0"
                  borderRadius="full"
                  bg="nm.bg"
                  display="grid"
                  placeItems="center"
                  flexShrink={0}
                  onClick={handleClose}
                  aria-label="閉じる"
                />
              </Box>

              {detailsVisible && (
                <>
                  {shop.visited && !shop.closed && (
                    <Box
                      bg="nm.bg"
                      borderRadius="nmMd"
                      px="1rem"
                      py="0.875rem"
                      mt="0.875rem"
                    >
                      <Box
                        fontFamily="mono"
                        fontSize="0.625rem"
                        letterSpacing="0.18em"
                        color="nm.inkMuted"
                        textTransform="uppercase"
                        mb="0.5rem"
                      >
                        お気に入り度
                      </Box>
                      <FavoriteRating rate={shop.rate} compact />
                    </Box>
                  )}

                  <Box mt="0.875rem" fontSize="0.8125rem">
                    {[
                      {
                        label: "ADDRESS",
                        value: (
                          <RestaurantAddressLink
                            address={shop.address}
                            mapsUrl={mapsUrl}
                          />
                        ),
                      },
                      {
                        label: "STATUS",
                        value: shop.closed
                          ? "閉店"
                          : shop.visited
                            ? "訪問済み"
                            : "気になる",
                      },
                    ].map(({ label, value }) => (
                      <Box
                        key={label}
                        py="0.625rem"
                        borderBottom="1px dashed"
                        borderBottomColor="nm.lineFaint"
                        _last={{ borderBottom: "0" }}
                      >
                        <Box
                          fontFamily="mono"
                          fontSize="0.625rem"
                          letterSpacing="0.15em"
                          color="nm.inkMuted"
                          mb="0.125rem"
                        >
                          {label}
                        </Box>
                        <Box color="nm.ink">{value}</Box>
                      </Box>
                    ))}
                  </Box>

                  <Box display="flex" gap="0.5rem" mt="1rem">
                    <RestaurantActions
                      mapsUrl={mapsUrl}
                      mapsLabel="Google Maps"
                    />
                  </Box>
                </>
              )}
            </Box>
          ) : (
            <>
              <Box
                px="1.125rem"
                pb="0.625rem"
                display="flex"
                alignItems="baseline"
                gap="0.375rem"
                borderBottom="1px solid"
                borderBottomColor="nm.lineFaint"
              >
                <Box
                  fontFamily="display"
                  fontSize="1.375rem"
                  fontWeight={700}
                  color="nm.ink"
                  lineHeight="1"
                >
                  {sortedRestaurants.length}
                </Box>
                <Box
                  fontSize="0.6875rem"
                  color="nm.inkMuted"
                  letterSpacing="0.1em"
                >
                  件 / SHOPS
                </Box>
              </Box>
              <Virtuoso
                style={{ height: "calc(88svh - 100px)" }}
                data={sortedRestaurants}
                itemContent={(_, r) => (
                  <MobileListItem
                    key={r.id}
                    restaurant={r}
                    allCategories={allCategories}
                    onClick={() => onSelect(r.id)}
                  />
                )}
              />
            </>
          )}
        </Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}
