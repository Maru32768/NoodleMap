import { Button } from "@/components/ui/button.tsx";
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { FlyToLocationButton } from "@/features/map/fly-to-location-button.tsx";
import {
  LocationTrackingMode,
  Map,
  MapEventHandler,
  MapHandle,
  MapSelectDetails,
} from "@/features/map/map.tsx";
import { useSearchState } from "@/features/search/use-search-state.ts";
import { filterShops, sortShops } from "@/features/search/utils.ts";
import { UpdateShopCommand, useShops } from "@/features/shops/api/use-shops.ts";
import { DetailPanel } from "@/features/shops/detail-panel.tsx";
import { MobileSheet } from "@/features/shops/mobile-sheet.tsx";
import {
  ShopEditDraft,
  ShopEditModal,
} from "@/features/shops/shop-edit-modal.tsx";
import { ShopFilters, Sidebar } from "@/features/shops/sidebar.tsx";
import { toastApiError } from "@/utils/toast.ts";
import { Box, Input } from "@chakra-ui/react";
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { CiFilter } from "react-icons/ci";

const DEFAULT_CENTER = { lat: 35.6895315, lng: 139.700492 } as const;

function MobileSearchBar({
  query,
  onQueryChange,
  onFilterClick,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onFilterClick: () => void;
}) {
  return (
    <Box
      position="absolute"
      top="14px"
      left="14px"
      right="14px"
      zIndex={600}
      display={{ base: "flex", md: "none" }}
      bg="nm.paper"
      borderRadius="999px"
      boxShadow="nmMd"
      alignItems="center"
      px="14px"
      py="8px"
      pl="14px"
      pr="10px"
      gap="8px"
    >
      <Box
        w="30px"
        h="30px"
        borderRadius="full"
        bg="nm.shu"
        display="grid"
        placeItems="center"
        fontFamily="display"
        color="nm.paper"
        fontWeight={700}
        fontSize="14px"
        flexShrink={0}
      >
        麺
      </Box>
      <Input
        flex="1"
        bg="transparent"
        border="none"
        outline="none"
        fontSize="14px"
        placeholder="店名・エリアで検索..."
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
        }}
      />
      <Button
        variant="plain"
        w="34px"
        h="34px"
        minW="34px"
        minH="34px"
        p="0"
        borderRadius="full"
        color="nm.ink"
        display="grid"
        placeItems="center"
        onClick={onFilterClick}
        aria-label="フィルター"
      >
        <CiFilter style={{ width: 22, height: 22 }} />
      </Button>
    </Box>
  );
}

function formatMapCoordinate(n: number) {
  return n.toFixed(6);
}

export default function SearchPage() {
  const {
    filters,
    handleFilterChange,
    handleMapViewChange,
    handleQueryChange,
    initialMapView,
    mapView,
    query,
  } = useSearchState();

  const deferredQuery = useDeferredValue(query);
  const deferredFilters = useDeferredValue(filters);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [locationTrackingMode, setLocationTrackingMode] =
    useState<LocationTrackingMode>("off");

  const mapRef = useRef<MapHandle>(null);

  const handleMoveEnd: MapEventHandler = useCallback(
    (map, source) => {
      if (source === "programmatic") {
        return;
      }

      const center = map.getCenter();
      const lat = formatMapCoordinate(center.lat);
      const lng = formatMapCoordinate(center.lng);
      handleMapViewChange({
        center: [Number(lat), Number(lng)],
        zoom: map.getZoom(),
      });
    },
    [handleMapViewChange],
  );

  const { shops, updateShop } = useShops();
  const currentUser = useCurrentUser();
  const isAdmin = currentUser.type === "admin";

  const filteredShops = useMemo(() => {
    if (!shops) {
      return [];
    }
    return filterShops(shops, {
      query: deferredQuery,
      // Tags are an admin-only feature for now; ignore any persisted tag
      // filter so non-admins never see shops silently filtered by it.
      filters: isAdmin ? deferredFilters : { ...deferredFilters, tagIds: [] },
    });
  }, [shops, deferredQuery, deferredFilters, isAdmin]);

  const sortedShops = useMemo(() => {
    const center = mapView
      ? { lat: mapView.center[0], lng: mapView.center[1] }
      : DEFAULT_CENTER;
    return sortShops(filteredShops, center);
  }, [filteredShops, mapView]);

  const selectedShop = useMemo(
    () => shops?.find((r) => r.id === selectedId) ?? undefined,
    [shops, selectedId],
  );
  const editShop = useMemo(
    () => shops?.find((r) => r.id === editId) ?? undefined,
    [shops, editId],
  );

  const handleSelect = useCallback(
    (id: string, details: MapSelectDetails = { source: "external" }) => {
      setSelectedId(id);
      if (details.source === "map" && details.latlng) {
        mapRef.current?.panTo(details.latlng, { animate: true });
        return;
      }

      const r = shops?.find((x) => x.id === id);
      if (r && mapRef.current) {
        const map = mapRef.current;
        map.panTo([r.lat, r.lng], { animate: true });
      }
    },
    [shops],
  );

  const handleClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleEditOpen = useCallback((id: string) => {
    setEditId(id);
  }, []);

  const handleEditSave = useCallback(
    async (draft: ShopEditDraft) => {
      const cmd: UpdateShopCommand = {
        name: draft.name,
        lat: draft.lat,
        lng: draft.lng,
        postalCode: draft.postalCode,
        address: draft.address,
        closed: draft.closed,
        googlePlaceId: draft.googlePlaceId,
        category: draft.category,
        eaten: draft.eaten,
        favorite: draft.favorite,
        rate: draft.rate,
        tagIds: draft.tagIds,
      };
      const result = await updateShop(draft.id, cmd);
      if (!result.ok) {
        toastApiError(result.error, {
          fallbackTitle: "店舗を更新できませんでした",
        });
        return;
      }

      setEditId(null);
      toaster.success({ description: "保存しました" });
    },
    [updateShop],
  );

  return (
    <Box
      position="relative"
      h="100vh"
      w="100vw"
      overflow="hidden"
      display="flex"
    >
      {/* Sidebar (desktop) */}
      <Sidebar
        allShops={shops ?? []}
        sortedShops={sortedShops}
        query={query}
        onQueryChange={handleQueryChange}
        filters={filters}
        onFilterChange={handleFilterChange}
        selectedId={selectedId}
        onSelect={handleSelect}
      />

      {/* Map column */}
      <Box position="absolute" inset="0" overflow="hidden" h="100%" w="100%">
        {/* Mobile search bar */}
        <MobileSearchBar
          query={query}
          onQueryChange={handleQueryChange}
          onFilterClick={() => setMobileFiltersOpen(true)}
        />

        <Box
          className={
            selectedShop ? "nm-map-shell nm-map-shell--detail" : "nm-map-shell"
          }
          position="relative"
          bg="nm.bgSoft"
          overflow="hidden"
          h="100%"
          w="100%"
        >
          <Map
            ref={mapRef}
            initialCenter={initialMapView.center}
            initialZoom={initialMapView.zoom}
            shops={filteredShops}
            selectedId={selectedId}
            onSelect={handleSelect}
            onMoveEnd={handleMoveEnd}
            onLocationTrackingModeChange={setLocationTrackingMode}
          />

          {/* Map legend */}
          <Box
            position="absolute"
            bottom="28px"
            left="396px"
            zIndex={500}
            bg="nm.paper"
            borderRadius="nmMd"
            px="14px"
            py="10px"
            boxShadow="nmMd"
            fontSize="11px"
            display={{ base: "none", md: "flex" }}
            alignItems="center"
            gap="14px"
          >
            {[
              { label: "食べた", bg: "nm.shu" },
              { label: "気になる", bg: "nm.paper", border: "nm.inkSoft" },
              { label: "閉店", bg: "nm.ink" },
            ].map(({ label, bg, border }) => (
              <Box
                key={label}
                display="flex"
                alignItems="center"
                gap="6px"
                color="nm.inkSoft"
              >
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  bg={bg}
                  border={border ? "2px solid" : "2px solid white"}
                  borderColor={border ?? "white"}
                  boxShadow={`0 0 0 1px var(--chakra-colors-nm-line-strong)`}
                />
                {label}
              </Box>
            ))}
          </Box>

          {/* Fly to location button */}
          <Box
            position="absolute"
            bg="nm.bg"
            borderRadius="full"
            bottom="calc(var(--nm-mobile-sheet-peek) + 0.75rem + env(safe-area-inset-bottom))"
            right={3}
            lg={{ bottom: 20, right: 5 }}
          >
            <FlyToLocationButton
              trackingMode={locationTrackingMode}
              onClick={() => {
                mapRef.current?.requestUserLocationTracking();
              }}
            />
          </Box>
        </Box>

        {/* Desktop detail panel */}
        {selectedShop && (
          <DetailPanel
            shop={selectedShop}
            onAdminEdit={handleEditOpen}
            onClose={handleClose}
          />
        )}
      </Box>

      {/* Mobile bottom sheet */}
      <MobileSheet
        shop={selectedShop}
        sortedShops={sortedShops}
        onAdminEdit={handleEditOpen}
        onSelect={handleSelect}
        onClose={handleClose}
      />

      <DrawerRoot
        open={mobileFiltersOpen}
        onOpenChange={(details) => setMobileFiltersOpen(details.open)}
        placement="bottom"
      >
        <DrawerBackdrop />
        <DrawerContent borderTopRadius="nmLg" height="90vh">
          <DrawerHeader>
            <DrawerTitle>フィルター</DrawerTitle>
          </DrawerHeader>
          <DrawerCloseTrigger />
          <DrawerBody px="0">
            <ShopFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </DrawerBody>
        </DrawerContent>
      </DrawerRoot>

      {editShop && (
        <ShopEditModal
          shop={editShop}
          open={!!editId}
          initialTab="info"
          onClose={() => setEditId(null)}
          onSave={handleEditSave}
        />
      )}
    </Box>
  );
}
