import { Restaurant } from "@/features/restaurants/api/useRestaurants.ts";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Icon as LeafletIcon, Map as LeafletMap } from "leaflet";
import { forwardRef, memo } from "react";
import { Link, Text, VStack } from "@chakra-ui/react";
import { LuExternalLink } from "react-icons/lu";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Button } from "@/components/ui/button.tsx";
import "./map.css";
import { Category } from "@/features/categories/api/useCategories.ts";

interface Props {
  categories: Category[];
  restaurants: Restaurant[];
  onSelectRestaurant?: (r: Restaurant) => void;
}

export const Map = memo(
  forwardRef<LeafletMap, Props>(function Map({ categories, restaurants }, ref) {
    return (
      <MapContainer
        ref={ref}
        preferCanvas
        zoomControl={false}
        center={[35.6895315, 139.700492]}
        zoom={13}
        maxZoom={20}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterGroup
          chunkedLoading
          disableClusteringAtZoom={15}
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
                    iconUrl: categories.find((x) => r.categories.includes(x.id))
                      ?.icon,
                    iconSize: [48, 48],
                    className: classNames.join(" "),
                  })
                }
              >
                <Popup>
                  <VStack
                    alignItems="stretch"
                    css={{
                      "& p": {
                        margin: 0,
                      },
                    }}
                  >
                    <VStack alignItems="start" gap={0}>
                      <Text textStyle="md" fontWeight="semibold">
                        {r.name}
                      </Text>
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
