import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  Icon as LeafletIcon,
  LatLngTuple,
  LeafletEvent,
  LeafletEventHandlerFn,
  Map as LeafletMap,
} from "leaflet";
import { forwardRef, memo, useEffect, useRef } from "react";
import { HStack, Link, Text, VStack } from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Button } from "@/components/ui/button.tsx";
import "./map.css";
import { Category } from "@/features/categories/api/use-categories.ts";
import { useGeolocated } from "react-geolocated";
import { useMergeRefs } from "@/utils/merge-refs.ts";
import loadingIcon from "@/assets/loading.gif";

export interface MapEventHandler {
  (map: LeafletMap, e: LeafletEvent): void;
}

interface Props {
  center: LatLngTuple | undefined;
  categories: Category[];
  restaurants: Restaurant[];
  clustering: boolean;
  onMoveEnd: MapEventHandler;
}

export const Map = memo(
  forwardRef<LeafletMap, Props>(function Map(
    { center, categories, restaurants, clustering, onMoveEnd },
    ref,
  ) {
    const internalRef = useRef<LeafletMap>(null);
    const refs = useMergeRefs(ref, internalRef);

    useGeolocated({
      onSuccess: (pos) => {
        if (center === undefined) {
          internalRef.current?.setView({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        }
      },
    });

    return (
      <MapContainer
        ref={refs}
        preferCanvas
        zoomControl={false}
        center={center ?? [35.6895315, 139.700492]}
        zoom={13}
        maxZoom={22}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        <TileLayer
          maxZoom={22}
          maxNativeZoom={22}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MoveEndListener onMoveEnd={onMoveEnd} />

        <MarkerClusterGroup
          chunkedLoading
          disableClusteringAtZoom={clustering ? 15 : -1}
          maxClusterRadius={40}
        >
          {restaurants.map((r) => {
            const restaurantUrl = new URL(
              "https://www.google.com/maps/search/",
            );
            restaurantUrl.searchParams.set("api", "1");
            restaurantUrl.searchParams.set("query", `${r.name} ${r.address}`);
            restaurantUrl.searchParams.set("query_place_id", r.googlePlaceId);

            const routeUrl = new URL("https://www.google.com/maps/dir/");
            routeUrl.searchParams.set("api", "1");
            routeUrl.searchParams.set("destination", r.name);
            routeUrl.searchParams.set("destination_place_id", r.googlePlaceId);

            const classNames: string[] = [];
            if (!r.visited) {
              classNames.push("icon-unvisited");
            }
            if (r.favorite) {
              classNames.push("icon-favorite");
            }

            return (
              <Marker
                key={r.id}
                position={[r.lat, r.lng]}
                icon={
                  new LeafletIcon({
                    iconUrl:
                      categories.find((x) => r.categories.includes(x.id))
                        ?.icon ?? loadingIcon,
                    iconSize: [48, 48],
                    className: classNames.join(" "),
                  })
                }
              >
                <Popup maxWidth={500}>
                  <VStack
                    alignItems="stretch"
                    css={{
                      "& p": {
                        margin: 0,
                      },
                    }}
                  >
                    <VStack alignItems="start" gap={0}>
                      <HStack whiteSpace="nowrap">
                        <Text textStyle="md" fontWeight="semibold">
                          {r.name}
                        </Text>
                        {r.closed && (
                          <Text textStyle="sm" color="red">
                            閉店
                          </Text>
                        )}
                      </HStack>
                      <Text textStyle="sm">{r.address}</Text>
                    </VStack>
                    <Button asChild variant="outline">
                      <Link href={restaurantUrl.toString()} target="_blank">
                        Google Mapsで開く
                        <LuExternalLink />
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={routeUrl.toString()} target="_blank">
                        Google Mapsでルート検索
                        <LuExternalLink />
                      </Link>
                    </Button>
                  </VStack>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    );
  }),
);

function MoveEndListener({ onMoveEnd }: { onMoveEnd: MapEventHandler }) {
  const map = useMap();

  useEffect(() => {
    const handler: LeafletEventHandlerFn = (e) => {
      onMoveEnd(map, e);
    };

    map.on("moveend", handler);
    return () => {
      map.removeEventListener("moveend", handler);
    };
  }, [map, onMoveEnd]);

  return null;
}
