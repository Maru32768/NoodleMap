import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import {
  useBackToMapTarget,
  useReturnToSearch,
} from "@/features/meal-records/record-navigation.tsx";
import {
  ACCOUNT_PATH,
  MEAL_RECORDS_PATH,
  SEARCH_PATH,
} from "@/utils/path.ts";
import { Box, chakra } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuBookOpen, LuMap, LuUser } from "react-icons/lu";
import { Link, type LinkProps, useLocation } from "react-router";

const ChakraLink = chakra(Link);

const tabProps = {
  flex: "1",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  fontSize: "10px",
} as const;

// The current page's tab is not a link: following it would reset the page.
function FooterTab({
  to,
  state,
  icon: Icon,
  active,
  children,
}: {
  to: LinkProps["to"];
  state?: unknown;
  icon: IconType;
  active: boolean;
  children: ReactNode;
}) {
  const content = (
    <>
      <Icon aria-hidden="true" size={20} />
      {children}
    </>
  );
  return active ? (
    <Box {...tabProps} aria-current="page" fontWeight={700} color="nm.shu">
      {content}
    </Box>
  ) : (
    <ChakraLink
      {...tabProps}
      to={to}
      state={state}
      fontWeight={500}
      color="nm.inkMuted"
      _hover={{ color: "nm.ink" }}
    >
      {content}
    </ChakraLink>
  );
}

/**
 * The phone-width tab bar: 地図 / 食べた記録, plus マイページ when signed in.
 * Guests get no ログイン tab while user features are not public.
 * Fixed above everything but dialogs; pages leave `--nm-footer-h` free at the bottom.
 */
export function MobileFooter() {
  const { pathname } = useLocation();
  const currentUser = useCurrentUser();
  const returnToSearch = useReturnToSearch();
  const backToMap = useBackToMapTarget();
  const guest = currentUser.type === "guest";

  return (
    <Box
      as="nav"
      aria-label="メインメニュー"
      position="fixed"
      left="0"
      right="0"
      bottom="0"
      zIndex={850}
      display={{ base: "flex", md: "none" }}
      h="var(--nm-footer-h)"
      pb="env(safe-area-inset-bottom)"
      bg="nm.paper"
      borderTop="1px solid"
      borderTopColor="nm.line"
    >
      <FooterTab
        to={backToMap.to}
        state={backToMap.state}
        icon={LuMap}
        active={pathname === SEARCH_PATH}
      >
        地図
      </FooterTab>
      <FooterTab
        to={MEAL_RECORDS_PATH}
        state={{ returnToSearch }}
        icon={LuBookOpen}
        active={pathname === MEAL_RECORDS_PATH}
      >
        食べた記録
      </FooterTab>
      {!guest && (
        <FooterTab
          to={ACCOUNT_PATH}
          state={{ returnToSearch }}
          icon={LuUser}
          active={pathname === ACCOUNT_PATH}
        >
          マイページ
        </FooterTab>
      )}
    </Box>
  );
}
