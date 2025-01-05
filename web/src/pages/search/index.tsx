import { Box } from "@chakra-ui/react";
import { useSearchParams } from "react-router";
import { useDebouncedCallback } from "use-debounce";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRestaurants } from "@/features/restaurants/api/use-restaurants.ts";
import { searchRestaurants } from "@/features/search/utils.ts";
import { Map, MapEventHandler } from "@/features/map/map.tsx";
import {
  CATEGORIES_PARAM_NAME,
  CLUSTERING_PARAM_NAME,
  FAVORITE_ONLY_PARAM_NAME,
  KEYWORD_PARAM_NAME,
  LAT_PARAM_NAME,
  LNG_PARAM_NAME,
  UNVISITED_PARAM_NAME,
  VISITED_PARAM_NAME,
} from "@/utils/search-params.ts";
import {
  SearchPanel,
  SearchPanelProps,
} from "@/features/search/search-panel.tsx";
import { useCategories } from "@/features/categories/api/use-categories.ts";
import { isBooleanStr } from "@/utils/std.ts";
import { SearchPanelModal } from "@/features/search/search-panel-modal.tsx";
import { useAtom } from "jotai";
import { searchPanelModalOpenAtom } from "@/state/search-panel-modal-state.ts";
import { Map as LeafletMap } from "leaflet";
import { FlyToLocationButton } from "@/features/map/fly-to-location-button.tsx";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams({
    [KEYWORD_PARAM_NAME]: "",
    [FAVORITE_ONLY_PARAM_NAME]: "false",
    [VISITED_PARAM_NAME]: "true",
    [UNVISITED_PARAM_NAME]: "false",
    [CLUSTERING_PARAM_NAME]: "true",
  });
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const [searchPanelModalOpen, setSearchPanelModalOpen] = useAtom(
    searchPanelModalOpenAtom,
  );

  const keywordParam = searchParams.get(KEYWORD_PARAM_NAME);

  const [currentCategories, setCurrentCategories] = useState(
    searchParams.getAll(CATEGORIES_PARAM_NAME),
  );
  const deferredCurrentCategories = useDeferredValue(currentCategories);
  useEffect(() => {
    setCurrentCategories(searchParams.getAll(CATEGORIES_PARAM_NAME));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...searchParams.getAll(CATEGORIES_PARAM_NAME)]);

  const [favoriteOnly, setFavoriteOnly] = useState(
    isBooleanStr(searchParams.get(FAVORITE_ONLY_PARAM_NAME)),
  );
  const deferredFavoriteOnly = useDeferredValue(favoriteOnly);
  useEffect(() => {
    setFavoriteOnly(isBooleanStr(searchParams.get(FAVORITE_ONLY_PARAM_NAME)));
  }, [searchParams]);

  const [visited, setVisited] = useState(
    isBooleanStr(searchParams.get(VISITED_PARAM_NAME)),
  );
  const deferredVisited = useDeferredValue(visited);
  useEffect(() => {
    setVisited(isBooleanStr(searchParams.get(VISITED_PARAM_NAME)));
  }, [searchParams]);

  const [unvisited, setUnvisited] = useState(
    isBooleanStr(searchParams.get(UNVISITED_PARAM_NAME)),
  );
  const deferredUnvisited = useDeferredValue(unvisited);
  useEffect(() => {
    setUnvisited(isBooleanStr(searchParams.get(UNVISITED_PARAM_NAME)));
  }, [searchParams]);

  const clustering = isBooleanStr(searchParams.get(CLUSTERING_PARAM_NAME));
  const latParam = searchParams.get(LAT_PARAM_NAME);
  const lngParam = searchParams.get(LNG_PARAM_NAME);
  const [initialCenter] = useState<[number, number] | undefined>(() => {
    const lat = parseFloat(latParam ?? "");
    const lng = parseFloat(lngParam ?? "");

    return isNaN(lat) || isNaN(lng) ? undefined : [lat, lng];
  });

  const leafletMapRef = useRef<LeafletMap>(null);
  const mapDraggingRef = useRef(false);
  const isMoveOccurredByParamChange = useRef(false);
  const handleDragStart = useCallback(() => {
    mapDraggingRef.current = true;
  }, []);
  const handleDragEnd = useCallback(() => {
    mapDraggingRef.current = false;
  }, []);
  useLayoutEffect(() => {
    const center = leafletMapRef.current?.getCenter();
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (!mapDraggingRef.current) {
      if (center?.lat !== lat || center?.lng !== lng) {
        leafletMapRef.current?.flyTo([lat, lng]);
        isMoveOccurredByParamChange.current = true;
      }
    }
  }, [latParam, lngParam]);

  const handleMoveEnd: MapEventHandler = useCallback((map) => {
    if (isMoveOccurredByParamChange.current) {
      isMoveOccurredByParamChange.current = false;
      return;
    }
    const center = map.getCenter();
    setSearchParamsRef.current((prev) => {
      const copy = new URLSearchParams(prev);
      copy.set(LAT_PARAM_NAME, String(center.lat));
      copy.set(LNG_PARAM_NAME, String(center.lng));
      return copy;
    });
  }, []);

  const { restaurants } = useRestaurants({
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { categories } = useCategories({
    onSuccess: (cs) => {
      if (!searchParams.has(CATEGORIES_PARAM_NAME)) {
        setCurrentCategories(cs.map((x) => x.id));
        setSearchParams((prev) => {
          const copy = new URLSearchParams(prev);
          cs.forEach((x) => {
            copy.append(CATEGORIES_PARAM_NAME, x.id);
          });
          return copy;
        });
      }
    },
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const updateKeywordDebounced = useDebouncedCallback(
    (query: string, resolve: (value: unknown) => void) => {
      resolve("");
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(KEYWORD_PARAM_NAME, query);
        return copy;
      });
    },
    300,
  );

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) {
      return undefined;
    }

    return searchRestaurants(
      restaurants,
      keywordParam ?? "",
      deferredCurrentCategories,
      deferredFavoriteOnly,
      deferredVisited,
      deferredUnvisited,
    );
  }, [
    restaurants,
    keywordParam,
    deferredCurrentCategories,
    deferredFavoriteOnly,
    deferredVisited,
    deferredUnvisited,
  ]);

  const searchPanelProps: SearchPanelProps = {
    count: filteredRestaurants?.length ?? 0,
    currentCategories: currentCategories,
    defaultKeyword: keywordParam ?? "",
    onChangeKeyword: (keyword) => {
      return new Promise((resolve) => {
        updateKeywordDebounced(keyword, resolve);
      });
    },
    categories: categories ?? [],
    onChangeCategories: (cs) => {
      setCurrentCategories(cs);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.delete(CATEGORIES_PARAM_NAME);
        cs.forEach((x) => {
          copy.append(CATEGORIES_PARAM_NAME, x);
        });
        return copy;
      });
    },
    favoriteOnly: favoriteOnly,
    onChangeFavoriteOnly: (x) => {
      setFavoriteOnly(x);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(FAVORITE_ONLY_PARAM_NAME, String(x));
        return copy;
      });
    },
    visited: visited,
    onChangeVisited: (x) => {
      setVisited(x);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(VISITED_PARAM_NAME, String(x));
        return copy;
      });
    },
    unvisited: unvisited,
    onChangeUnvisited: (x) => {
      setUnvisited(x);
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(UNVISITED_PARAM_NAME, String(x));
        return copy;
      });
    },
    clustering: clustering,
    onChangeClustering: (x) => {
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        copy.set(CLUSTERING_PARAM_NAME, String(x));
        return copy;
      });
      window.location.reload();
    },
  };

  return (
    <Box position="relative" boxSize="full">
      <Box
        padding={6}
        borderRadius="md"
        zIndex={1000}
        position="absolute"
        top={10}
        left={10}
        bg="white"
        width="24rem"
        display="none"
        lg={{
          display: "block",
        }}
      >
        <SearchPanel {...searchPanelProps} />
      </Box>
      <Box
        position="absolute"
        bg="white"
        borderRadius="full"
        top={7}
        right={7}
        lg={{
          top: 10,
          right: 10,
        }}
        zIndex={1000}
      >
        <FlyToLocationButton
          onFly={(to) => {
            leafletMapRef.current?.flyTo(to);
          }}
        />
      </Box>
      <SearchPanelModal
        open={searchPanelModalOpen}
        onOpenChange={() => {
          setSearchPanelModalOpen(!searchPanelModalOpen);
        }}
        searchPanelProps={searchPanelProps}
      />
      <Map
        ref={leafletMapRef}
        center={initialCenter}
        categories={categories ?? []}
        restaurants={filteredRestaurants ?? []}
        clustering={clustering}
        onMoveEnd={handleMoveEnd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    </Box>
  );
}
