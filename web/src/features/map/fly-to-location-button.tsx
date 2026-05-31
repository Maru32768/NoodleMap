import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@chakra-ui/react";
import { FaLocationCrosshairs } from "react-icons/fa6";
import type { LocationTrackingMode } from "./map.tsx";

interface Props {
  trackingMode: LocationTrackingMode;
  onClick: () => void;
}

export function FlyToLocationButton({ trackingMode, onClick }: Props) {
  return (
    <Button
      variant="ghost"
      boxSize="3rem"
      padding={0}
      borderRadius="full"
      color={trackingMode === "off" ? "nm.ink" : "#1a73e8"}
      aria-label="Current location"
      onClick={onClick}
    >
      <Icon boxSize="1.5rem">
        <FaLocationCrosshairs />
      </Icon>
    </Button>
  );
}
