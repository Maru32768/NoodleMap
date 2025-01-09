const loader = new Loader({
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  version: "weekly",
  language: "ja",
  region: "JP",
  libraries: ["places", "maps", "core", "marker"],
});
await loader.load();

import Map = google.maps.Map;
import PlacesService = google.maps.places.PlacesService;
import Marker = google.maps.Marker;
import Place = google.maps.Place;
import PlacesServiceStatus = google.maps.places.PlacesServiceStatus;
import QueryAutocompletePrediction = google.maps.places.QueryAutocompletePrediction;
import AutocompleteService = google.maps.places.AutocompleteService;
import { Box, VStack } from "@chakra-ui/react";
import { memo, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import Select from "react-select/base";
import { toastError } from "@/utils/toast.ts";
import { Loader } from "@googlemaps/js-api-loader";

const autocompleteService = new AutocompleteService();

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
  initialPlace?: Place;
  onSelect: (res: FindResult) => void;
}

export const GooglePlaceFinder = memo(function GooglePlaceFinder({
  initialPlace,
  onSelect,
}: Props) {
  const [inputText, setInputText] = useState("");
  const [isSelectMenuOpen, setIsSelectMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [predictions, setPredictions] = useState<QueryAutocompletePrediction[]>(
    [],
  );
  const options = predictions.map((x) => {
    return {
      label: x.description,
      value: x.place_id,
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

        if (status !== PlacesServiceStatus.OK) {
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
  const mapRef = useRef<Map>();
  const placesServiceRef = useRef<PlacesService>();
  const markerRef = useRef<Marker | undefined>(
    initialPlace
      ? new Marker({
          place: initialPlace,
        })
      : undefined,
  );

  useEffect(() => {
    if (!mapWrapperRef.current) {
      return;
    }
    const map = new Map(mapWrapperRef.current, {
      center: { lat: 35.6895315, lng: 139.700492 },
      zoom: 17,
    });
    mapRef.current = map;
    placesServiceRef.current = new PlacesService(map);

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
                if (status !== "OK") {
                  toastError({
                    description: status.toString(),
                  });
                  return;
                }
                markerRef.current?.setMap(null);

                const lat = res.geometry?.location.lat();
                if (lat === undefined) {
                  toastError({
                    title: "lat is missing",
                  });
                }

                const lng = res.geometry?.location.lng();
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

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const businessStatus = (res as any).business_status as
                  | string
                  | undefined;
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
                  name: res.name,
                  lat: lat ?? 0,
                  lng: lng ?? 0,
                  postalCode: postalCode ?? "",
                  address: address ?? "",
                  closed: closed ?? false,
                  placeId: placeId ?? "",
                });

                markerRef.current = new Marker({
                  place: {
                    placeId: placeId,
                    location: {
                      lat: lat ?? 0,
                      lng: lng ?? 0,
                    },
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
});
