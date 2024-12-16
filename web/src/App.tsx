import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Box, Text } from "@chakra-ui/react";
import { Icon } from "leaflet";
import icon from "@/assets/icon.png";
import { Navigate, Route, Routes } from "react-router";
import { Layout } from "@/components/layout/Layout.tsx";
import { SEARCH_PATH } from "@/path.ts";
import { request } from "@/utils/http.ts";
import useSWR from "swr";

interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  googlePlaceId: string;
  rate: number;
  favorite: boolean;
}

function App() {
  const { data: restaurants } = useSWR(["/api/restaurants"], () => {
    return request<{ restaurants: Restaurant[] }>("/api/restaurants").then(
      (res) => {
        return res.body.restaurants;
      },
    );
  });

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path={SEARCH_PATH}
          element={
            <Box width="100vw" overflow="scroll">
              <MapContainer
                center={[35.6842965, 139.7368976]}
                zoom={13}
                style={{
                  height: 600,
                  marginTop: "80px",
                  marginBottom: "90px",
                }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {restaurants?.map((r) => {
                  return (
                    <Marker
                      key={r.id}
                      position={[r.lat, r.lng]}
                      icon={
                        new Icon({
                          iconUrl: icon,
                          iconSize: [24, 24],
                        })
                      }
                    >
                      <Popup>
                        <Text>{r.name}</Text>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </Box>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={SEARCH_PATH} replace />} />
    </Routes>
  );
}

export default App;

// type Restaurant = {
//   id: number;
//   name: string;
//   lat: number;
//   lng: number;
// };
//
// const RESTAURANTS = [
//   {
//     id: 1,
//     name: "RAMEN MATSUI",
//     lat: 35.6887731,
//     lng: 139.7151334,
//   },
//   {
//     id: 2,
//     name: "Ramen Afro Beats",
//     lat: 35.6887899,
//     lng: 139.7112803,
//   },
//   {
//     id: 3,
//     name: "支那蕎麦 澤田",
//     lat: 35.6888166,
//     lng: 139.7114697,
//   },
//   {
//     id: 4,
//     name: "麺場78",
//     lat: 35.6932473,
//     lng: 139.7056064,
//   },
// ] as const satisfies Restaurant[];
