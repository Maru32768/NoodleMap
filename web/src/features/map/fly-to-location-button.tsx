import { Button } from "@/components/ui/button.tsx";
import { useGeolocated } from "react-geolocated";
import { Icon } from "@chakra-ui/react";
import { FaLocationCrosshairs } from "react-icons/fa6";

interface Props {
  onFly: (to: [number, number]) => void;
}

export function FlyToLocationButton({ onFly }: Props) {
  const { coords } = useGeolocated({
    watchPosition: true,
    watchLocationPermissionChange: true,
  });

  if (!coords) {
    return null;
  }

  return (
    <Button
      colorPalette="gray"
      variant="ghost"
      boxSize="3rem"
      padding={0}
      borderRadius="full"
      onClick={() => {
        onFly([coords.latitude, coords.longitude]);
      }}
    >
      <Icon boxSize="1.5rem">
        <FaLocationCrosshairs />
      </Icon>
    </Button>
  );
}
