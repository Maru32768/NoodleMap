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
import { useCategories } from "@/features/categories/api/use-categories.ts";
import { FlyToLocationButton } from "@/features/map/fly-to-location-button.tsx";
import {
  LocationTrackingMode,
  Map,
  MapEventHandler,
  MapHandle,
} from "@/features/map/map.tsx";
import {
  UpdateRestaurantCommand,
  useRestaurants,
} from "@/features/restaurants/api/use-restaurants.ts";
import { DetailPanel } from "@/features/restaurants/detail-panel.tsx";
import { MobileSheet } from "@/features/restaurants/mobile-sheet.tsx";
import {
  RestaurantEditDraft,
  RestaurantEditModal,
} from "@/features/restaurants/restaurant-edit-modal.tsx";
import { RestaurantFilters, Sidebar } from "@/features/restaurants/sidebar.tsx";
import { useSearchState } from "@/features/search/use-search-state.ts";
import { filterRestaurants, sortRestaurants } from "@/features/search/utils.ts";
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

  const { restaurants, updateRestaurant } = useRestaurants();
  const { categories } = useCategories();

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) {
      return [];
    }
    return filterRestaurants(restaurants, categories ?? [], {
      query: deferredQuery,
      filters: deferredFilters,
    });
  }, [restaurants, categories, deferredQuery, deferredFilters]);

  const sortedRestaurants = useMemo(() => {
    const center = mapView
      ? { lat: mapView.center[0], lng: mapView.center[1] }
      : DEFAULT_CENTER;
    return sortRestaurants(filteredRestaurants, center);
  }, [filteredRestaurants, mapView]);

  const selectedRestaurant = useMemo(
    () => restaurants?.find((r) => r.id === selectedId) ?? undefined,
    [restaurants, selectedId],
  );
  const editRestaurant = useMemo(
    () => restaurants?.find((r) => r.id === editId) ?? undefined,
    [restaurants, editId],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const r = restaurants?.find((x) => x.id === id);
      if (r && mapRef.current) {
        const map = mapRef.current;
        map.panTo([r.lat, r.lng], { animate: true });
      }
    },
    [restaurants],
  );

  const handleClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleEditOpen = useCallback((id: string) => {
    setEditId(id);
  }, []);

  const handleEditSave = useCallback(
    async (draft: RestaurantEditDraft) => {
      const cmd: UpdateRestaurantCommand = {
        name: draft.name,
        lat: draft.lat,
        lng: draft.lng,
        postalCode: draft.postalCode,
        address: draft.address,
        closed: draft.closed,
        googlePlaceId: draft.googlePlaceId,
        visited: draft.visited,
        favorite: draft.favorite,
        rate: draft.rate,
      };
      await updateRestaurant(draft.id, cmd);
      setEditId(null);
      toaster.success({ description: "保存しました" });
    },
    [updateRestaurant],
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
        allRestaurants={restaurants ?? []}
        sortedRestaurants={sortedRestaurants}
        allCategories={categories ?? []}
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
            selectedRestaurant
              ? "nm-map-shell nm-map-shell--detail"
              : "nm-map-shell"
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
            categories={categories ?? []}
            restaurants={filteredRestaurants}
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
        {selectedRestaurant && (
          <DetailPanel
            restaurant={selectedRestaurant}
            allCategories={categories ?? []}
            onAdminEdit={handleEditOpen}
            onClose={handleClose}
          />
        )}
      </Box>

      {/* Mobile bottom sheet */}
      <MobileSheet
        shop={selectedRestaurant}
        sortedRestaurants={sortedRestaurants}
        allCategories={categories ?? []}
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
        <DrawerContent borderTopRadius="nmLg" maxH="82vh">
          <DrawerHeader>
            <DrawerTitle>フィルター</DrawerTitle>
          </DrawerHeader>
          <DrawerCloseTrigger />
          <DrawerBody px="0">
            <RestaurantFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </DrawerBody>
        </DrawerContent>
      </DrawerRoot>

      {editRestaurant && categories && (
        <RestaurantEditModal
          shop={editRestaurant}
          categories={categories}
          open={!!editId}
          initialTab="info"
          onClose={() => setEditId(null)}
          onSave={handleEditSave}
        />
      )}
    </Box>
  );
}
