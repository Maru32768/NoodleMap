import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { useReturnToSearch } from "@/features/meal-records/record-navigation.tsx";
import { ACCOUNT_PATH } from "@/utils/path.ts";
import { chakra } from "@chakra-ui/react";
import { LuUser } from "react-icons/lu";
import { Link } from "react-router";

const ChakraLink = chakra(Link);

/**
 * Link to マイページ, an icon alone unless `showLabel`; renders nothing for guests.
 * 地図に戻る there returns to this map view.
 */
export function AccountLink({ showLabel = false }: { showLabel?: boolean }) {
  const currentUser = useCurrentUser();
  const returnToSearch = useReturnToSearch();
  if (currentUser.type === "guest") {
    return null;
  }

  return (
    <ChakraLink
      to={ACCOUNT_PATH}
      state={{ returnToSearch }}
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="2px"
      minW="34px"
      h={showLabel ? undefined : "34px"}
      px={showLabel ? "6px" : undefined}
      py={showLabel ? "4px" : undefined}
      rounded={showLabel ? "nmMd" : "full"}
      color="nm.ink"
      fontSize="10px"
      flexShrink={0}
      _hover={{ bg: "nm.bg" }}
      aria-label={showLabel ? undefined : "マイページ"}
      title={showLabel ? undefined : "マイページ"}
    >
      <LuUser size={showLabel ? 18 : 16} aria-hidden="true" />
      {showLabel && "マイページ"}
    </ChakraLink>
  );
}
