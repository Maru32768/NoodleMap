import { Button } from "@/components/ui/button.tsx";
import {
  Map,
  MapEventHandler,
  MapHandle,
  MapSelectDetails,
} from "@/features/map/map.tsx";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { Box, BoxProps } from "@chakra-ui/react";
import { useCallback, useEffect, useRef } from "react";

export interface AdminMapProps {
  shops: Restaurant[];
  filtered: Restaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  addingMode: boolean;
  onMapClick: (latlng: { lat: number; lng: number } | null) => void;
  draftLatLng: { lat: number; lng: number } | null;
  display?: BoxProps["display"];
}

const ADMIN_INITIAL_CENTER: [number, number] = [35.685, 139.74];
const ADMIN_INITIAL_ZOOM = 11;

const noopMoveEnd: MapEventHandler = () => {};

export function AdminMap({
  shops,
  filtered,
  selectedId,
  onSelect,
  addingMode,
  onMapClick,
  draftLatLng,
  display = { base: "none", lg: "block" },
}: AdminMapProps) {
  const mapRef = useRef<MapHandle>(null);

  const handleMapClick = useCallback(
    (latlng: { lat: number; lng: number }) => {
      if (addingMode) {
        onMapClick(latlng);
      }
    },
    [addingMode, onMapClick],
  );

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const shop = shops.find((s) => s.id === selectedId);
    if (shop) {
      mapRef.current?.panTo([shop.lat, shop.lng], { animate: true });
    }
  }, [selectedId, shops]);

  const handleSelect = useCallback(
    (id: string, details: MapSelectDetails) => {
      if (details.source === "map" && details.latlng) {
        mapRef.current?.panTo(details.latlng, { animate: true });
      }

      onSelect(id);
    },
    [onSelect],
  );

  return (
    <Box
      position="relative"
      h="100%"
      overflow="hidden"
      display={display}
      className={addingMode ? "nm-adding-mode" : undefined}
    >
      <Map
        ref={mapRef}
        initialCenter={ADMIN_INITIAL_CENTER}
        initialZoom={ADMIN_INITIAL_ZOOM}
        restaurants={filtered}
        selectedId={selectedId}
        onSelect={handleSelect}
        onMoveEnd={noopMoveEnd}
        onMapClick={handleMapClick}
        draftLatLng={draftLatLng}
      />

      {addingMode && (
        <Box
          position="absolute"
          left="0"
          right="0"
          bottom={{ base: "70px", lg: "0" }}
          display="flex"
          alignItems="center"
          gap="12px"
          px="16px"
          py="10px"
          bg="rgba(26, 22, 20, 0.82)"
          backdropFilter="blur(6px)"
          color="nm.paper"
          fontSize="13px"
          zIndex={10}
        >
          <Box as="span">📍 地図上をクリックして新しい店舗を追加</Box>
          <Box flex="1" />
          <Button
            variant="plain"
            color="nm.paper"
            bg="rgba(255,255,255,0.15)"
            px="12px"
            py="6px"
            h="auto"
            minH="auto"
            rounded="nmMd"
            fontSize="12px"
            _hover={{ bg: "rgba(255,255,255,0.25)" }}
            onClick={() => onMapClick(null)}
          >
            キャンセル
          </Button>
        </Box>
      )}
    </Box>
  );
}
