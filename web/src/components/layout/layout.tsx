import { Loading } from "@/components/loading.tsx";
import { AbsoluteCenter, Box } from "@chakra-ui/react";
import { Suspense } from "react";
import { Outlet } from "react-router";

export function Layout() {
  return (
    <Box boxSize="full">
      <Suspense
        fallback={
          <AbsoluteCenter>
            <Loading size="xl" />
          </AbsoluteCenter>
        }
      >
        <Outlet />
      </Suspense>
    </Box>
  );
}
