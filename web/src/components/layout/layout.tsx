import {
  Button,
  ButtonProps,
  Center,
  chakra,
  Grid,
  GridItem,
  HStack,
  Text,
} from "@chakra-ui/react";
import { Link, Outlet, useLocation } from "react-router";
import { FAVORITE_PATH, SEARCH_PATH } from "@/utils/path.ts";
import { Suspense } from "react";
import { Loading } from "@/components/loading.tsx";

const ChakraLink = chakra(Link);

function ButtonLink(props: ButtonProps & { to: string }) {
  return <Button as={ChakraLink} {...props} />;
}

export function Layout() {
  const location = useLocation();

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
          paddingY={2}
          paddingX={4}
          boxSize="full"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text>Maru&apos;s Noodle Map</Text>
          <HStack>
            <ButtonLink
              size="xl"
              colorPalette="teal"
              variant="ghost"
              aria-expanded={location.pathname.startsWith(SEARCH_PATH)}
              to={SEARCH_PATH}
            >
              店舗検索
            </ButtonLink>
            <ButtonLink
              size="xl"
              colorPalette="teal"
              variant="ghost"
              aria-expanded={location.pathname.startsWith(FAVORITE_PATH)}
              to={FAVORITE_PATH}
            >
              お気に入り
            </ButtonLink>
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
