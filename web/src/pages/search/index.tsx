import { Box } from "@chakra-ui/react";
import { Map as LeafletMap } from "leaflet";
import { useSearchParams } from "react-router";
import { useDebouncedCallback } from "use-debounce";
import { useMemo, useRef } from "react";
import { useRestaurants } from "@/features/restaurants/api/useRestaurants.ts";
import { searchRestaurants } from "@/features/search/utils.ts";
import { useGeolocated } from "react-geolocated";
import { Map } from "@/features/map/map.tsx";
import {
  CATEGORIES_PARAM_NAME,
  KEYWORD_PARAM_NAME,
} from "@/utils/search-params.ts";
import { SearchPanel } from "@/features/search/search-panel.tsx";
import { useCategories } from "@/features/categories/api/useCategories.ts";

export default function SearchPage() {
  // TODO Decide whether to include lat and lng.
  const [searchParams, setSearchParams] = useSearchParams({
    [KEYWORD_PARAM_NAME]: "",
  });
  const keyword = searchParams.get(KEYWORD_PARAM_NAME);
  const currentCategories = searchParams.getAll(CATEGORIES_PARAM_NAME);

  const { restaurants } = useRestaurants();
  const { categories } = useCategories({
    onSuccess: (cs) => {
      if (!searchParams.has(CATEGORIES_PARAM_NAME)) {
        setSearchParams((prev) => {
          console.log(...prev);
          return {
            ...prev,
            [CATEGORIES_PARAM_NAME]: cs.map((x) => x.id),
          };
        });
      }
    },
  });

  const leafMapRef = useRef<LeafletMap>(null);
  useGeolocated({
    onSuccess: (pos) => {
      leafMapRef.current?.setView({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    },
  });

  const updateKeyword = useDebouncedCallback(
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

    return searchRestaurants(restaurants, keyword ?? "", currentCategories);
  }, [restaurants, keyword, currentCategories]);

  return (
    <Box position="relative" boxSize="full">
      <Box
        padding={6}
        borderRadius="md"
        zIndex={1000}
        position="absolute"
        top="10"
        left="10"
        bg="white"
      >
        <SearchPanel
          categories={categories ?? []}
          currentCategories={currentCategories}
          defaultKeyword={keyword ?? ""}
          onChangeKeyword={(keyword) => {
            return new Promise((resolve) => {
              updateKeyword(keyword, resolve);
            });
          }}
          onChangeCategories={(cs) => {
            setSearchParams((prev) => {
              const copy = new URLSearchParams(prev);
              copy.delete(CATEGORIES_PARAM_NAME);
              cs.forEach((x) => {
                copy.append(CATEGORIES_PARAM_NAME, x);
              });
              return copy;
            });
          }}
        />
      </Box>
      <Map
        ref={leafMapRef}
        categories={categories ?? []}
        restaurants={filteredRestaurants ?? []}
      />
    </Box>
  );
}
