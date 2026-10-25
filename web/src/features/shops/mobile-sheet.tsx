import { CategoryBadge } from "@/components/category-badge.tsx";
import { ShopThumb } from "@/components/shop-thumb.tsx";
import { CloseButton } from "@/components/ui/close-button.tsx";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import {
  ShopActions,
  ShopAddressLink,
  buildGoogleMapsUrl,
} from "@/features/shops/shop-actions.tsx";
import { ShopLinkList } from "@/features/shops/shop-link-list.tsx";
import { ShopsLoadState } from "@/features/shops/shops-load-state.tsx";
import {
  shopDisplaySystemTags,
  shopStatusLabel,
} from "@/features/shops/status.ts";
import { SystemTagChips, TagChips } from "@/features/shops/tag-chips.tsx";
import { ShopRating } from "@/features/visits/shop-rating.tsx";
import { ShopVisitHistory } from "@/features/visits/shop-visit-history.tsx";
import { useIsPc } from "@/utils/use-is-pc.ts";
import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  type SheetContentProps,
  type SheetRef,
} from "react-modal-sheet";
import { Virtuoso } from "react-virtuoso";

type MobileSheetLevel = "peek" | "full";

export interface MobileSheetProps {
  shop: Shop | undefined;
  sortedShops: Shop[];
  onAdminEdit: (id: string) => void;
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
  shop,
  onClick,
}: {
  shop: Shop;
  onClick: () => void;
}) {
  const currentUser = useCurrentUser();
  const displaySystemTags = shopDisplaySystemTags(shop);
  return (
    <Box
      display="flex"
      gap="0.75rem"
      px="1.125rem"
      py="0.75rem"
      borderBottom="1px solid"
      borderBottomColor="nm.lineFaint"
      opacity={shop.lifecycleStatus === "closed" ? 0.55 : 1}
      cursor="pointer"
      _active={{ bg: "nm.bg" }}
      onClick={onClick}
    >
      <ShopThumb
        catType={shop.category}
        closed={shop.lifecycleStatus === "closed"}
        size="md"
      />
      <Box flex="1" minWidth="0">
        <Box
          fontSize="0.875rem"
          fontWeight={600}
          color="nm.ink"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {shop.name}
        </Box>
        <Box fontSize="0.6875rem" color="nm.inkMuted" mt="0.125rem">
          {shop.category === "udon" ? "うどん" : "ラーメン"} ·{" "}
          {shop.address.slice(0, 14)}...
        </Box>
        {shop.eaten && shop.lifecycleStatus !== "closed" && (
          <Box mt="0.1875rem">
            <MiniHearts rate={shop.rate} />
          </Box>
        )}
        {displaySystemTags.length > 0 && (
          <Box mt="0.375rem">
            <SystemTagChips tags={displaySystemTags} size="xs" />
          </Box>
        )}
        {currentUser.type === "admin" && shop.tags.length > 0 && (
          <Box mt="0.375rem">
            <TagChips tags={shop.tags} limit={3} size="xs" />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function MobileSheetContent({
  isDetailMode,
  ...props
}: SheetContentProps & { isDetailMode: boolean }) {
  const { y } = Sheet.useContext();

  return (
    <Sheet.Content
      {...props}
      scrollStyle={isDetailMode ? { paddingBottom: y } : undefined}
    />
  );
}

export function MobileSheet({
  shop,
  sortedShops,
  onAdminEdit,
  onSelect,
  onClose,
}: MobileSheetProps) {
  const currentUser = useCurrentUser();
  const isPc = useIsPc();
  const sheetRef = useRef<SheetRef>(null);
  const mapsUrl = shop ? buildGoogleMapsUrl(shop) : "";
  const isDetailMode = Boolean(shop);
  const [level, setLevel] = useState<MobileSheetLevel>("peek");
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const detailsVisible = isDetailMode && level !== "peek";

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

        <MobileSheetContent
          isDetailMode={isDetailMode}
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
                <ShopThumb
                  catType={shop.category}
                  closed={shop.lifecycleStatus === "closed"}
                  size="lg"
                  photo={
                    shop.coverPhotoUrl
                      ? {
                          url: shop.coverPhotoUrl,
                          alt: `${shop.name}の代表写真`,
                        }
                      : undefined
                  }
                />

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
                    <CategoryBadge catType={shop.category} />
                    <Box as="span" ml="0.5rem">
                      <ShopAddressLink
                        address={shop.address}
                        mapsUrl={mapsUrl}
                      />
                    </Box>
                  </Box>
                  {shop.eaten && (
                    <Box mt="0.375rem">
                      <MiniHearts rate={shop.rate} />
                    </Box>
                  )}
                  {shopDisplaySystemTags(shop).length > 0 && (
                    <Box mt="0.5rem">
                      <SystemTagChips
                        tags={shopDisplaySystemTags(shop)}
                        size="xs"
                      />
                    </Box>
                  )}
                  {currentUser.type === "admin" && shop.tags.length > 0 && (
                    <Box mt="0.5rem">
                      <TagChips tags={shop.tags} limit={3} size="xs" />
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
                  {shop.eaten && (
                    <Box
                      bg="nm.bg"
                      borderRadius="nmMd"
                      px="1rem"
                      py="0.875rem"
                      mt="0.875rem"
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
                          お気に入り度
                        </Box>
                        <Box fontSize="0.6875rem" color="nm.inkMuted">
                          {shop.visitCount}回訪問
                        </Box>
                      </Box>
                      <ShopRating shop={shop} compact />
                    </Box>
                  )}

                  <Box mt="0.875rem" fontSize="0.8125rem">
                    {[
                      {
                        label: "ADDRESS",
                        value: (
                          <ShopAddressLink
                            address={shop.address}
                            mapsUrl={mapsUrl}
                          />
                        ),
                      },
                      {
                        label: "STATUS",
                        value: shopStatusLabel(shop),
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

                  <Box mt="0.75rem">
                    <ShopLinkList links={shop.links} />
                  </Box>

                  {shop.eaten && (
                    <Box mt="1rem">
                      <ShopVisitHistory shopId={shop.id} />
                    </Box>
                  )}

                  <Box display="flex" gap="0.5rem" mt="1rem">
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
                </>
              )}
            </Box>
          ) : (
            <ShopsLoadState>
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
                  {sortedShops.length}
                </Box>
                <Box
                  fontSize="0.6875rem"
                  color="nm.inkMuted"
                  letterSpacing="0.1em"
                >
                  件 / SHOPS
                </Box>
              </Box>
              {sortedShops.length === 0 ? (
                <Box
                  textAlign="center"
                  px="1.25rem"
                  py="2rem"
                  color="nm.inkFaint"
                  fontSize="0.8125rem"
                >
                  <Box
                    fontFamily="display"
                    fontSize="1.125rem"
                    color="nm.inkMuted"
                    mb="0.375rem"
                  >
                    該当なし
                  </Box>
                  <Box>条件を変えて再度お試しください</Box>
                </Box>
              ) : (
                <Virtuoso
                  style={{ height: "calc(88svh - 100px)" }}
                  data={sortedShops}
                  itemContent={(_, r) => (
                    <MobileListItem
                      key={r.id}
                      shop={r}
                      onClick={() => onSelect(r.id)}
                    />
                  )}
                />
              )}
            </ShopsLoadState>
          )}
        </MobileSheetContent>
      </Sheet.Container>
    </Sheet>
  );
}
