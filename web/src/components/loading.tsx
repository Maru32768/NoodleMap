import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle.tsx";
import { ComponentProps } from "react";

export function Loading(props: ComponentProps<typeof ProgressCircleRoot>) {
  return (
    <ProgressCircleRoot value={null} size="sm" colorPalette="teal" {...props}>
      <ProgressCircleRing />
    </ProgressCircleRoot>
  );
}
