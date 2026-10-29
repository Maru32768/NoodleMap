import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { useReturnToSearch } from "@/features/meal-records/record-navigation.tsx";
import { ACCOUNT_PATH } from "@/utils/path.ts";
import { chakra } from "@chakra-ui/react";
import { LuUser } from "react-icons/lu";
import { Link } from "react-router";

const ChakraLink = chakra(Link);

/** Icon link to マイページ; renders nothing for guests. 地図に戻る there returns to this map view. */
export function AccountLink() {
  const currentUser = useCurrentUser();
  const returnToSearch = useReturnToSearch();
  if (currentUser.type === "guest") {
    return null;
  }

  return (
    <ChakraLink
      to={ACCOUNT_PATH}
      state={{ returnToSearch }}
      display="grid"
      placeItems="center"
      w="34px"
      h="34px"
      rounded="full"
      color="nm.ink"
      flexShrink={0}
      _hover={{ bg: "nm.bg" }}
      aria-label="マイページ"
      title="マイページ"
    >
      <LuUser aria-hidden="true" />
    </ChakraLink>
  );
}
