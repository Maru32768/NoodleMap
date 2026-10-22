import { toastError } from "@/utils/toast.ts";
import { Box, VStack } from "@chakra-ui/react";
import { Loader } from "@googlemaps/js-api-loader";
import { memo, useEffect, useRef, useState } from "react";
import Select from "react-select/base";
import { useDebouncedCallback } from "use-debounce";

// Loaded on mount, not at import, so the admin page still renders when the Maps JS is blocked.
const loader = new Loader({
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  version: "weekly",
  language: "ja",
  region: "JP",
  libraries: ["places", "maps", "core", "marker"],
});

// https://developers.google.com/maps/documentation/javascript/reference/places-service?hl=ja#PlaceResult
const fields = [
  "name",
  "place_id",
  "address_components",
  "formatted_address",
  "geometry",
  "business_status",
] as const;

export interface FindResult {
  name: string;
  placeId: string;
  postalCode: string;
  address: string;
  lat: number;
  lng: number;
  closed: boolean;
}

interface Props {
  initialPlace?: google.maps.Place;
  onSelect: (res: FindResult) => void;
}

export const GooglePlaceFinder = memo(function GooglePlaceFinder(
  props: Props,
) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    loader.load().then(
      () => active && setStatus("ready"),
      () => active && setStatus("failed"),
    );
    return () => {
      active = false;
    };
  }, []);

  if (status === "ready") {
    return <PlaceFinder {...props} />;
  }
  return (
    <Box p="16px" fontSize="12px" color="nm.inkMuted">
      {status === "loading"
        ? "Google マップを読み込み中..."
        : "Google マップを読み込めませんでした。店舗情報はフォームに直接入力できます。"}
    </Box>
  );
});

function PlaceFinder({ initialPlace, onSelect }: Props) {
  const [autocompleteService] = useState(
    () => new google.maps.places.AutocompleteService(),
  );
  const [inputText, setInputText] = useState("");
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [predictions, setPredictions] = useState<google.maps.places.QueryAutocompletePrediction[]>(
    [],
  );
  const options = predictions.map((x) => {
    return {
      label: x.description,
      value: x.place_id ?? "",
    };
  });
  const [selectedOptionValue, setSelectedOptionValue] = useState<string>();
  const selectedOption = options.find((x) => x.value === selectedOptionValue);

  const queryPredictions = useDebouncedCallback((input: string) => {
    autocompleteService.getQueryPredictions(
      {
        input,
      },
      (res, status) => {
        setIsLoading(false);

        if (status !== google.maps.places.PlacesServiceStatus.OK) {
          toastError({
            description: status.toString(),
          });
          return;
        }

        if (res === null) {
          toastError({
            description: "res is null",
          });
          return;
        }

        setPredictions(res);
      },
    );
  }, 200);

  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService>(null);
  const markerRef = useRef<google.maps.Marker | undefined>(
    initialPlace
      ? new google.maps.Marker({
          position: initialPlace.location,
        })
      : undefined,
  );

  useEffect(() => {
    if (!mapWrapperRef.current) {
      return;
    }
    const map = new google.maps.Map(mapWrapperRef.current, {
      center: { lat: 35.6895315, lng: 139.700492 },
      zoom: 17,
    });
    mapRef.current = map;
    placesServiceRef.current = new google.maps.places.PlacesService(map);

    if (markerRef.current && initialPlace?.location) {
      markerRef.current.setMap(map);
      map.setCenter(initialPlace.location);
    }

    return () => {
      mapRef.current?.unbindAll();
    };
  }, [initialPlace]);

  return (
    <VStack alignItems="stretch" boxSize="full" minWidth="24rem">
      <Select
        isLoading={isLoading}
        options={options}
        value={selectedOption}
        onChange={(x) => {
          setSelectedOptionValue(x?.value ?? undefined);
          if (x) {
            placesServiceRef.current?.getDetails(
              {
                placeId: x.value,
                fields: [...fields],
              },
              (res, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK) {
                  toastError({
                    description: status.toString(),
                  });
                  return;
                }

                if (res === null) {
                  toastError({
                    description: "res is null",
                  });
                  return;
                }

                markerRef.current?.setMap(null);

                const lat = res.geometry?.location?.lat();
                if (lat === undefined) {
                  toastError({
                    title: "lat is missing",
                  });
                }

                const lng = res.geometry?.location?.lng();
                if (lng === undefined) {
                  toastError({
                    title: "lng is missing",
                  });
                }

                const postalCode = res.address_components?.find((x) =>
                  x.types.includes("postal_code"),
                )?.short_name;
                if (postalCode === undefined) {
                  toastError({
                    title: "postalCode is missing",
                  });
                }

                const businessStatus = res.business_status;
                if (businessStatus === undefined) {
                  toastError({
                    title: "businessStatus is missing",
                  });
                }
                const closed = businessStatus === "CLOSED_PERMANENTLY";

                const formattedAddress = res.formatted_address;
                if (formattedAddress === undefined) {
                  toastError({
                    title: "formattedAddress is missing",
                  });
                }
                const address = formattedAddress?.startsWith("〒")
                  ? formattedAddress.substring(
                      formattedAddress.indexOf(" ") + 1,
                    )
                  : formattedAddress;

                const placeId = res.place_id;
                if (placeId === undefined) {
                  toastError({
                    title: "placeId is missing",
                  });
                }

                onSelect({
                  name: res.name ?? "",
                  lat: lat ?? 0,
                  lng: lng ?? 0,
                  postalCode: postalCode ?? "",
                  address: address ?? "",
                  closed,
                  placeId: placeId ?? "",
                });

                markerRef.current = new google.maps.Marker({
                  position: {
                    lat: lat ?? 0,
                    lng: lng ?? 0,
                  },
                });
                if (mapRef.current) {
                  markerRef.current?.setMap(mapRef.current);
                  if (res.geometry?.viewport) {
                    mapRef.current.fitBounds(res.geometry.viewport);
                  }
                }
              },
            );
          }
        }}
        inputValue={inputText}
        onInputChange={(x) => {
          setInputText(x);
          if (x !== "") {
            setIsLoading(true);
            queryPredictions(x);
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
      <Box ref={mapWrapperRef} boxSize="full" />
    </VStack>
  );
}
