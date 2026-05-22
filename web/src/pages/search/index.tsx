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
import { Map, MapEventHandler, MapHandle } from "@/features/map/map.tsx";
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
import {
  CategoryType,
  ClosedState,
  VisitState,
  filterRestaurants,
  sortRestaurants,
} from "@/features/search/utils.ts";
import {
  CATEGORY_TYPE_PARAM_NAME,
  CLOSED_STATE_PARAM_NAME,
  FAV_MIN_PARAM_NAME,
  KEYWORD_PARAM_NAME,
  LAT_PARAM_NAME,
  LNG_PARAM_NAME,
  VISIT_STATE_PARAM_NAME,
} from "@/utils/search-params.ts";
import { Box, Input } from "@chakra-ui/react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CiFilter } from "react-icons/ci";
import { useNavigationType, useSearchParams } from "react-router";
import { useDebouncedCallback } from "use-debounce";

function MobileSearchBar({
  syncedQuery,
  onQueryChange,
  onFilterClick,
}: {
  syncedQuery: string;
  onQueryChange: (q: string) => void;
  onFilterClick: () => void;
}) {
  const [localQuery, setLocalQuery] = useState(syncedQuery);
  if (localQuery !== syncedQuery) {
    setLocalQuery(syncedQuery);
  }

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
        value={localQuery}
        onChange={(e) => {
          setLocalQuery(e.target.value);
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

function isCategoryType(s: string | null): s is CategoryType {
  return s === "all" || s === "ramen" || s === "udon";
}
function isVisitState(s: string | null): s is VisitState {
  return s === "all" || s === "visited" || s === "wish";
}
function isClosedState(s: string | null): s is ClosedState {
  return s === "all" || s === "hide";
}

function formatMapCoordinate(n: number) {
  return n.toFixed(6);
}

export default function SearchPage() {
  const navigationType = useNavigationType();

  const [searchParams, setSearchParams] = useSearchParams({
    [KEYWORD_PARAM_NAME]: "",
    [CATEGORY_TYPE_PARAM_NAME]: "all",
    [VISIT_STATE_PARAM_NAME]: "visited",
    [CLOSED_STATE_PARAM_NAME]: "hide",
    [FAV_MIN_PARAM_NAME]: "0",
  });

  const latParam = searchParams.get(LAT_PARAM_NAME);
  const lngParam = searchParams.get(LNG_PARAM_NAME);
  const [initialCenter] = useState<[number, number] | undefined>(() => {
    const lat = parseFloat(latParam ?? "");
    const lng = parseFloat(lngParam ?? "");
    return isNaN(lat) || isNaN(lng) ? undefined : [lat, lng];
  });

  const keywordParam = searchParams.get(KEYWORD_PARAM_NAME) ?? "";
  const ctParam = searchParams.get(CATEGORY_TYPE_PARAM_NAME);
  const [categoryType, setCategoryType] = useState<CategoryType>(
    isCategoryType(ctParam) ? ctParam : "all",
  );
  const vsParam = searchParams.get(VISIT_STATE_PARAM_NAME);
  const [visitState, setVisitState] = useState<VisitState>(
    isVisitState(vsParam) ? vsParam : "all",
  );
  const csParam = searchParams.get(CLOSED_STATE_PARAM_NAME);
  const [closedState, setClosedState] = useState<ClosedState>(
    isClosedState(csParam) ? csParam : "hide",
  );
  const [favMin, setFavMin] = useState<number>(
    Math.min(
      100,
      Math.max(0, parseInt(searchParams.get(FAV_MIN_PARAM_NAME) ?? "0", 10)),
    ),
  );

  const deferredCategoryType = useDeferredValue(categoryType);
  const deferredVisitState = useDeferredValue(visitState);
  const deferredClosedState = useDeferredValue(closedState);
  const deferredFavMin = useDeferredValue(favMin);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const mapRef = useRef<MapHandle>(null);

  useEffect(() => {
    if (navigationType !== "POP") {
      return;
    }
    if (latParam === null || lngParam === null) {
      return;
    }

    const center = mapRef.current?.getCenter();
    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    if (
      center &&
      (Math.abs(center.lat - lat) > 0.000001 ||
        Math.abs(center.lng - lng) > 0.000001)
    ) {
      mapRef.current?.flyTo([lat, lng]);
    }
  }, [latParam, lngParam, navigationType]);

  const handleMoveEnd: MapEventHandler = useCallback(
    (map, source) => {
      if (source === "programmatic") {
        return;
      }

      const center = map.getCenter();
      const lat = formatMapCoordinate(center.lat);
      const lng = formatMapCoordinate(center.lng);
      setSearchParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          copy.set(LAT_PARAM_NAME, lat);
          copy.set(LNG_PARAM_NAME, lng);
          return copy;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const { restaurants, updateRestaurant } = useRestaurants();
  const { categories } = useCategories();

  const updateKeywordDebounced = useDebouncedCallback((q: string) => {
    setSearchParams((prev) => {
      const copy = new URLSearchParams(prev);
      copy.set(KEYWORD_PARAM_NAME, q);
      return copy;
    });
  }, 300);

  const handleQueryChange = useCallback(
    (q: string) => {
      updateKeywordDebounced(q);
    },
    [updateKeywordDebounced],
  );

  const handleCategoryTypeChange = useCallback(
    (ct: CategoryType) => {
      setCategoryType(ct);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(CATEGORY_TYPE_PARAM_NAME, ct);
        return copy;
      });
    },
    [setSearchParams],
  );

  const handleVisitStateChange = useCallback(
    (vs: VisitState) => {
      setVisitState(vs);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(VISIT_STATE_PARAM_NAME, vs);
        return copy;
      });
    },
    [setSearchParams],
  );

  const handleClosedStateChange = useCallback(
    (cs: ClosedState) => {
      setClosedState(cs);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(CLOSED_STATE_PARAM_NAME, cs);
        return copy;
      });
    },
    [setSearchParams],
  );

  const handleFavMinChange = useCallback(
    (n: number) => {
      setFavMin(n);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(FAV_MIN_PARAM_NAME, String(n));
        return copy;
      });
    },
    [setSearchParams],
  );

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) {
      return [];
    }
    return filterRestaurants(restaurants, categories ?? [], {
      query: keywordParam,
      categoryType: deferredCategoryType,
      visitState: deferredVisitState,
      closedState: deferredClosedState,
      favMin: deferredFavMin,
    });
  }, [
    restaurants,
    categories,
    keywordParam,
    deferredCategoryType,
    deferredVisitState,
    deferredClosedState,
    deferredFavMin,
  ]);

  const sortedRestaurants = useMemo(() => {
    const lat = parseFloat(latParam ?? "");
    const lng = parseFloat(lngParam ?? "");
    const mapCenter =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : { lat: 35.6895315, lng: 139.700492 };
    return sortRestaurants(filteredRestaurants, mapCenter);
  }, [filteredRestaurants, latParam, lngParam]);

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
        query={keywordParam}
        onQueryChange={handleQueryChange}
        categoryType={categoryType}
        onCategoryTypeChange={handleCategoryTypeChange}
        visitState={visitState}
        onVisitStateChange={handleVisitStateChange}
        closedState={closedState}
        onClosedStateChange={handleClosedStateChange}
        favMin={favMin}
        onFavMinChange={handleFavMinChange}
        selectedId={selectedId}
        onSelect={handleSelect}
      />

      {/* Map column */}
      <Box position="absolute" inset="0" overflow="hidden" h="100%" w="100%">
        {/* Mobile search bar */}
        <MobileSearchBar
          syncedQuery={keywordParam}
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
            center={initialCenter}
            categories={categories ?? []}
            restaurants={filteredRestaurants}
            selectedId={selectedId}
            onSelect={handleSelect}
            onMoveEnd={handleMoveEnd}
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
              onFly={(to) => {
                mapRef.current?.flyTo(to);
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
              categoryType={categoryType}
              onCategoryTypeChange={handleCategoryTypeChange}
              visitState={visitState}
              onVisitStateChange={handleVisitStateChange}
              closedState={closedState}
              onClosedStateChange={handleClosedStateChange}
              favMin={favMin}
              onFavMinChange={handleFavMinChange}
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
