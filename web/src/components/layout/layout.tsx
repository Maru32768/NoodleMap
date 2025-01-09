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
import { useAuth } from "@/features/auth/use-auth.ts";
import { RiLogoutBoxRLine } from "react-icons/ri";
import { LoadableButton } from "@/components/loadable-button.tsx";

export function Layout() {
  const setOpen = useSetAtom(searchPanelModalOpenAtom);
  const { currentUser, logout } = useAuth();

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
      <GridItem
        gridArea="header"
        position="sticky"
        top={0}
        zIndex={10000}
        bg="white"
      >
        <HStack
          paddingY={2}
          paddingX={4}
          boxSize="full"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text>Maru&apos;s Noodle Map</Text>
          <HStack>
            {currentUser && (
              <LoadableButton
                paddingX={0}
                size="lg"
                colorPalette="teal"
                onClick={() => {
                  return logout();
                }}
              >
                <Icon boxSize="1.5rem">
                  <RiLogoutBoxRLine />
                </Icon>
              </LoadableButton>
            )}
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
