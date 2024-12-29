import { Box } from "@chakra-ui/react";
import { Map as LeafletMap } from "leaflet";
import { useSearchParams } from "react-router";
import { useDebouncedCallback } from "use-debounce";
import { useMemo, useRef } from "react";
import { useRestaurants } from "@/features/restaurants/api/useRestaurants.ts";
import { searchRestaurants } from "@/features/search/utils.ts";
import { useGeolocated } from "react-geolocated";
import { Map } from "@/features/map/map.tsx";
import { KEYWORD_PARAM_NAME } from "@/utils/search-params.ts";
import { SearchPanel } from "@/features/search/search-panel.tsx";

export default function SearchPage() {
  const leafMapRef = useRef<LeafletMap>(null);
  const { restaurants } = useRestaurants();
  useGeolocated({
    onSuccess: (pos) => {
      leafMapRef.current?.setView({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    },
  });

  // TODO Decide whether to include lat and lng.
  const [searchParams, setSearchParams] = useSearchParams({
    [KEYWORD_PARAM_NAME]: "",
  });
  const keyword = searchParams.get(KEYWORD_PARAM_NAME);

  const updateKeyword = useDebouncedCallback(
    (query: string, resolve: (value: unknown) => void) => {
      resolve("");
      setSearchParams((prev) => {
        return {
          ...prev,
          [KEYWORD_PARAM_NAME]: query,
        };
      });
    },
    300,
  );

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) {
      return undefined;
    }

    return searchRestaurants(restaurants, keyword ?? "");
  }, [restaurants, keyword]);

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
          defaultKeyword={keyword ?? ""}
          onChangeKeyword={(keyword) => {
            return new Promise((resolve) => {
              updateKeyword(keyword, resolve);
            });
          }}
        />
      </Box>
      <Map ref={leafMapRef} restaurants={filteredRestaurants ?? []} />
    </Box>
  );
}
