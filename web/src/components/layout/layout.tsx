import {
  Button,
  Center,
  Grid,
  GridItem,
  HStack,
  Icon,
  Text,
} from "@chakra-ui/react";
import { Outlet } from "react-router";
import { Suspense } from "react";
import { Loading } from "@/components/loading.tsx";
import { useSetAtom } from "jotai";
import { searchPanelModalOpenAtom } from "@/state/search-panel-modal-state.ts";
import { LuTextSearch } from "react-icons/lu";

export function Layout() {
  const setOpen = useSetAtom(searchPanelModalOpenAtom);

  return (
    <Grid
      boxSize="full"
      gridTemplateRows="4rem 1fr"
      gridTemplateColumns="1fr"
      gridTemplateAreas={`
                "header"
                "main"
    `}
    >
      <GridItem gridArea="header">
        <HStack
          position="relative"
          paddingY={2}
          paddingX={4}
          boxSize="full"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text>Maru&apos;s Noodle Map</Text>
          <Button
            paddingX={0}
            size="lg"
            colorPalette="teal"
            lg={{
              display: "none",
            }}
            onClick={() => {
              setOpen((prev) => !prev);
            }}
          >
            <Icon boxSize="1.5rem">
              <LuTextSearch />
            </Icon>
          </Button>
        </HStack>
      </GridItem>
      <GridItem gridArea="main" bg="gray.100">
        <Suspense
          fallback={
            <Center boxSize="full">
              <Loading />
            </Center>
          }
        >
          <Outlet />
        </Suspense>
      </GridItem>
    </Grid>
  );
}
