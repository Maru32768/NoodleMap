import {
  Box,
  Button,
  ButtonProps,
  chakra,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link, Outlet } from "react-router";
import { FAVORITE_PATH, SEARCH_PATH } from "@/path.ts";

const ChakraLink = chakra(Link);

function ButtonLink(props: ButtonProps & { to: string }) {
  return <Button as={ChakraLink} {...props} />;
}

export function Layout() {
  return (
    <VStack boxSize="full">
      <HStack
        paddingY={2}
        paddingX={4}
        height="4rem"
        width="full"
        alignItems="center"
        justifyContent="space-between"
      >
        <Text>Title</Text>
        <HStack>
          <ButtonLink
            size="xl"
            colorPalette="gray"
            variant="ghost"
            to={SEARCH_PATH}
          >
            店舗検索
          </ButtonLink>
          <ButtonLink
            size="xl"
            colorPalette="gray"
            variant="ghost"
            to={FAVORITE_PATH}
          >
            お気に入り
          </ButtonLink>
        </HStack>
      </HStack>
      <Box width="full" bg="yellow">
        <Outlet />
      </Box>
    </VStack>
  );
}
