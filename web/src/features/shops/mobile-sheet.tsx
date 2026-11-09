import { CategoryBadge } from "@/components/category-badge.tsx";
import { ShopThumb } from "@/components/shop-thumb.tsx";
import { CloseButton } from "@/components/ui/close-button.tsx";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { ShopMealRecordHistory } from "@/features/meal-records/shop-meal-record-history.tsx";
import { ShopRating } from "@/features/meal-records/shop-rating.tsx";
import { stationLabel } from "@/features/search/utils.ts";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { BusinessHoursSummary } from "@/features/shops/business-hours-summary.tsx";
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
  temporaryClosureLabel,
} from "@/features/shops/status.ts";
import { SystemTagChips, TagChips } from "@/features/shops/tag-chips.tsx";
import { useIsPc } from "@/utils/use-is-pc.ts";
import { Box } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, type SheetRef } from "react-modal-sheet";
import { Virtuoso } from "react-virtuoso";

export interface MobileSheetProps {
  /** Kept mounted but hidden behind another page, so it keeps its height. */
  hidden?: boolean;
  shop: Shop | undefined;
  sortedShops: Shop[];
  onAdminEdit: (id: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

// Peek heights are clamped so short and tall screens stay usable.
const PEEK = { minPx: 132, ratio: 0.205, maxPx: 144 };
// Collapsed: the drag handle and the 件 / SHOPS count row only.
const COLLAPSED_PX = 56;
const COLLAPSED_SNAP = 1;
const PEEK_SNAP = 2;
const FULL_SNAP = 3;

// The peek stays this tall above the footer, which covers the sheet's bottom.
function getPeekRatio(
  viewportHeight: number,
  config: { minPx: number; ratio: number; maxPx: number },
  footerHeight: number,
) {
  if (viewportHeight <= 0) {
    return config.ratio;
  }
  const height = Math.min(
    config.maxPx,
    Math.max(config.minPx, viewportHeight * config.ratio),
  );
  return (height + footerHeight) / viewportHeight;
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
          {stationLabel(shop) ?? `${shop.address.slice(0, 14)}...`}
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

export function MobileSheet({
  hidden = false,
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
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  // --nm-footer-h includes the safe area, which only CSS knows; a probe measures it.
  const footerProbeRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setFooterHeight(footerProbeRef.current?.offsetHeight ?? 0);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    sheetRef.current?.snapTo(COLLAPSED_SNAP);
  }, [onClose]);

  // The map's controls ride just above the sheet, up to its peek height.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }
    const root = document.documentElement;
    const update = (visible: number) => {
      const peek = sheetRef.current?.snapPoints[PEEK_SNAP]?.snapValue;
      root.style.setProperty(
        "--nm-mobile-sheet-peek",
        `${peek === undefined ? visible : Math.min(visible, peek)}px`,
      );
    };
    update(sheet.yInverted.get());
    const unsubscribe = sheet.yInverted.on("change", update);
    return () => {
      unsubscribe();
      root.style.removeProperty("--nm-mobile-sheet-peek");
    };
  }, [isPc]);

  // A shop picked while the sheet is collapsed would show only its first line.
  const shopId = shop?.id;
  const shopSelectedRef = useRef(false);
  useEffect(() => {
    shopSelectedRef.current = shopId !== undefined;
    const sheet = sheetRef.current;
    if (
      shopId !== undefined &&
      sheet &&
      sheet.snapPoints.length > 0 &&
      (sheet.currentSnap ?? 0) < PEEK_SNAP
    ) {
      sheet.snapTo(PEEK_SNAP);
    }
  }, [shopId]);

  // The sheet opens before it has measured itself, which makes initialSnap
  // fall back to fully open; settle once the snap points exist.
  const handleOpenEnd = useCallback(() => {
    const settle = () => {
      const sheet = sheetRef.current;
      if (!sheet) {
        return;
      }
      if (sheet.snapPoints.length === 0) {
        requestAnimationFrame(settle);
        return;
      }
      sheet.snapTo(shopSelectedRef.current ? PEEK_SNAP : COLLAPSED_SNAP);
    };
    settle();
  }, []);

  const snapPoints = [
    0,
    getPeekRatio(
      viewportHeight,
      { minPx: COLLAPSED_PX, ratio: 0, maxPx: COLLAPSED_PX },
      footerHeight,
    ),
    getPeekRatio(viewportHeight, PEEK, footerHeight),
    1,
  ];

  if (isPc) {
    return null;
  }

  return (
    <>
      <Box
        ref={footerProbeRef}
        position="fixed"
        h="var(--nm-footer-h)"
        visibility="hidden"
        pointerEvents="none"
      />
      <Sheet
        ref={sheetRef}
        isOpen
        snapPoints={snapPoints}
        onClose={onClose}
        initialSnap={COLLAPSED_SNAP}
        onOpenEnd={handleOpenEnd}
        disableDismiss
        // The sheet is portalled, so hiding the page does not hide it.
        disableScrollLocking={hidden}
        // Hidden without display: none, which would measure the sheet as 0px and empty its snap points.
        // Spread only when hidden: a visibility key overrides the sheet's own.
        style={{
          zIndex: 800,
          ...(hidden && { visibility: "hidden" as const }),
        }}
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
            <Box
              display="flex"
              justifyContent="center"
              py="0.5rem"
              pb="0.25rem"
            >
              <Box w="36px" h="4px" bg="nm.inkFaint" borderRadius="2px" />
            </Box>
          </Sheet.Header>

          <Sheet.Content
            disableScroll={(state) => state.currentSnap !== FULL_SNAP}
            style={{ paddingBottom: "var(--nm-footer-h)" }}
          >
            {shop ? (
              <Box px="1.125rem" pb="1.125rem">
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
                      as="h2"
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

                {shop.publicNote && (
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
                      公開メモ
                    </Box>
                    <Box
                      fontSize="0.8125rem"
                      color="nm.ink"
                      lineHeight="1.55"
                      whiteSpace="pre-wrap"
                      overflowWrap="anywhere"
                    >
                      {shop.publicNote}
                    </Box>
                  </Box>
                )}

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
                        {shop.mealRecordCount}件の記録
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
                    ...[stationLabel(shop)]
                      .filter((label) => label !== null)
                      .map((value) => ({ label: "STATION", value })),
                    ...(shop.lifecycleStatus === "closed"
                      ? []
                      : [
                          {
                            label: "HOURS",
                            value: <BusinessHoursSummary shop={shop} />,
                          },
                        ]),
                    {
                      label: "STATUS",
                      value: shopStatusLabel(shop),
                    },
                    ...[temporaryClosureLabel(shop)]
                      .filter((label) => label !== null)
                      .map((value) => ({ label: "休業", value })),
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
                    <ShopMealRecordHistory shopId={shop.id} />
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
                    // The open sheet's height (react-modal-sheet's default) less
                    // the drag handle and count row above, and the footer below.
                    style={{
                      height:
                        "calc(100dvh - env(safe-area-inset-top) - 34px - 50px - var(--nm-footer-h))",
                    }}
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
          </Sheet.Content>
        </Sheet.Container>
      </Sheet>
    </>
  );
}
