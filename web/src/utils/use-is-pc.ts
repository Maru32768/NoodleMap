import { useBreakpointValue } from "@chakra-ui/react";

export function useIsPc(): boolean {
  return useBreakpointValue({ base: false, md: true }) ?? false;
}
