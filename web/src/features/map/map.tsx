import { Restaurant } from "@/features/restaurants/api/useRestaurants.ts";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Icon as LeafletIcon, Map as LeafletMap } from "leaflet";
import { forwardRef, memo } from "react";
import { Link, Text } from "@chakra-ui/react";
import icon from "@/assets/icon.png";
import { LuExternalLink } from "react-icons/lu";

interface Props {
  restaurants: Restaurant[];
}

export const Map = memo(
  forwardRef<LeafletMap, Props>(function Map({ restaurants }, ref) {
    return (
      <MapContainer
        ref={ref}
        layers={[]}
        zoomControl={false}
        center={[35.6895315, 139.700492]}
        zoom={13}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {restaurants.map((r) => {
          const url = new URL("https://www.google.com/maps/dir/");
          url.searchParams.set("api", "1");
          url.searchParams.set("destination", r.name);
          url.searchParams.set("destination_place_id", r.googlePlaceId);

          return (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={
                new LeafletIcon({
                  iconUrl: icon,
                  iconSize: [24, 24],
                })
              }
            >
              <Popup>
                <Text>{r.name}</Text>
                <Link href={url.toString()} target="_blank">
                  Google Mapsでルート検索
                  <LuExternalLink />
                </Link>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    );
  }),
);
