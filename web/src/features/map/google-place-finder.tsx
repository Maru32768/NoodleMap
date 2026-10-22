import { Map, MapHandle } from "@/features/map/map.tsx";
import type { Shop } from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";
import {
  ApiError,
  ApiErrorBodyFor,
  apiClient,
  apiError,
  apiOk,
  withApiResult,
} from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import { Box, VStack } from "@chakra-ui/react";
import { useRef, useState } from "react";
import Select from "react-select/base";
import { useDebouncedCallback } from "use-debounce";

export type FindResult = components["schemas"]["PlaceDetails"];
type PlaceSuggestion = components["schemas"]["PlaceSuggestion"];

const AUTOCOMPLETE = "/api/v1/auth/google-places/autocomplete";
const DETAILS = "/api/v1/auth/google-places/details";

const PREVIEW_CENTER: [number, number] = [35.6895315, 139.700492];
const NO_SHOPS: Shop[] = [];
const noop = () => {};

function fetchSuggestions(q: string, sessionToken: string) {
  return withApiResult<
    PlaceSuggestion[],
    ApiErrorBodyFor<typeof AUTOCOMPLETE, "get">
  >(AUTOCOMPLETE, async () => {
    const res = await apiClient.GET(AUTOCOMPLETE, {
      params: { query: { q, sessionToken } },
    });
    if (res.error) {
      return apiError(AUTOCOMPLETE, res.response, res.error);
    }
    return apiOk(res.data.suggestions);
  });
}

function fetchDetails(placeId: string, sessionToken: string) {
  return withApiResult<FindResult, ApiErrorBodyFor<typeof DETAILS, "get">>(
    DETAILS,
    async () => {
      const res = await apiClient.GET(DETAILS, {
        params: { query: { placeId, sessionToken } },
      });
      if (res.error) {
        return apiError(DETAILS, res.response, res.error);
      }
      return apiOk(res.data);
    },
  );
}

interface Props {
  onSelect: (res: FindResult) => void;
}

export function GooglePlaceFinder({ onSelect }: Props) {
  // Groups the autocomplete calls and the closing details call into one Google billing session.
  const sessionTokenRef = useRef(crypto.randomUUID());
  const mapRef = useRef<MapHandle>(null);
  const [inputText, setInputText] = useState("");
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>();
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const options = suggestions.map((x) => ({
    label: x.secondaryText ? `${x.mainText} ${x.secondaryText}` : x.mainText,
    value: x.placeId,
  }));
  const selectedOption = options.find((x) => x.value === selectedPlaceId);

  const handleError = (error: ApiError) => {
    if (error.type === "google_places_not_configured") {
      setNotConfigured(true);
      return;
    }
    toastApiError(error);
  };

  const querySuggestions = useDebouncedCallback(async (input: string) => {
    const res = await fetchSuggestions(input, sessionTokenRef.current);
    setIsLoading(false);
    if (!res.ok) {
      handleError(res.error);
      return;
    }
    setSuggestions(res.data);
  }, 200);

  const selectPlace = async (placeId: string) => {
    const res = await fetchDetails(placeId, sessionTokenRef.current);
    // A details call ends the session; the next search starts a new one.
    sessionTokenRef.current = crypto.randomUUID();
    if (!res.ok) {
      handleError(res.error);
      return;
    }
    onSelect(res.data);
    setPin({ lat: res.data.lat, lng: res.data.lng });
    mapRef.current?.panTo([res.data.lat, res.data.lng], { animate: true });
  };

  return (
    <VStack alignItems="stretch" boxSize="full" gap="0">
      {notConfigured ? (
        <Box p="16px" fontSize="12px" color="nm.inkMuted">
          Google Place
          検索を利用できません。店舗情報はフォームに直接入力できます。
        </Box>
      ) : (
        <Select
          aria-label="Google Place を検索"
          isLoading={isLoading}
          options={options}
          value={selectedOption}
          onChange={(x) => {
            setSelectedPlaceId(x?.value);
            if (x) {
              void selectPlace(x.value);
            }
          }}
          inputValue={inputText}
          onInputChange={(x) => {
            setInputText(x);
            if (x !== "") {
              setIsLoading(true);
              void querySuggestions(x);
            }
          }}
          menuIsOpen={isSelectMenuOpen}
          onMenuOpen={() => {
            setIsSelectMenuOpen(true);
          }}
          onMenuClose={() => {
            setIsSelectMenuOpen(false);
          }}
        />
      )}
      <Box flex="1" minH="200px">
        <Map
          ref={mapRef}
          initialCenter={PREVIEW_CENTER}
          initialZoom={16}
          shops={NO_SHOPS}
          selectedId={null}
          onSelect={noop}
          onMoveEnd={noop}
          draftLatLng={pin}
        />
      </Box>
    </VStack>
  );
}
