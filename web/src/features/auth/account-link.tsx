import { ButtonLink } from "@/components/button-link.tsx";
import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import { ACCOUNT_PATH } from "@/utils/path.ts";
import { LuUser } from "react-icons/lu";

/** Icon link to マイページ; renders nothing for guests. */
export function AccountLink() {
  const currentUser = useCurrentUser();
  if (currentUser.type === "guest") {
    return null;
  }

  return (
    <ButtonLink
      to={ACCOUNT_PATH}
      variant="plain"
      w="34px"
      h="34px"
      minW="34px"
      p="0"
      rounded="full"
      color="nm.ink"
      flexShrink={0}
      _hover={{ bg: "nm.bg" }}
      aria-label="マイページ"
      title="マイページ"
    >
      <LuUser />
    </ButtonLink>
  );
}
