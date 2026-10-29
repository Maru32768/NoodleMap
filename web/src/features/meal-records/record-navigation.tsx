import { MEAL_RECORDS_PATH } from "@/utils/path.ts";
import { Button, chakra } from "@chakra-ui/react";
import { ReactNode } from "react";
import { LuArrowLeft, LuBookOpen } from "react-icons/lu";
import { Link, type Location, useLocation } from "react-router";

const ChakraLink = chakra(Link);

type SearchLocation = Pick<
  Location<unknown>,
  "pathname" | "search" | "hash" | "state"
>;

function searchLocationIn(state: unknown): SearchLocation | undefined {
  if (
    typeof state !== "object" ||
    state === null ||
    !("returnToSearch" in state)
  ) {
    return;
  }
  const destination = state.returnToSearch;
  if (
    typeof destination !== "object" ||
    destination === null ||
    !("pathname" in destination) ||
    destination.pathname !== "/search" ||
    !("search" in destination) ||
    typeof destination.search !== "string" ||
    !("hash" in destination) ||
    typeof destination.hash !== "string" ||
    !("state" in destination)
  ) {
    return;
  }
  return {
    pathname: destination.pathname,
    search: destination.search,
    hash: destination.hash,
    state: destination.state,
  };
}

export function restoresSearchCamera(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "restoreSearchCamera" in state &&
    state.restoreSearchCamera === true &&
    searchLocationIn(state) !== undefined
  );
}

// The search page to return to from a page opened here: this one, or the one this page was opened from.
export function useReturnToSearch(): SearchLocation | undefined {
  const location = useLocation();
  const state: unknown = location.state;
  return location.pathname === "/search"
    ? {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        state: restoresSearchCamera(state)
          ? searchLocationIn(state)?.state
          : state,
      }
    : searchLocationIn(state);
}

export function RecordVenueLink({
  venueId,
  children,
}: {
  venueId: string;
  children: ReactNode;
}) {
  const returnToSearch = useReturnToSearch();
  return (
    <Link
      to={`/venues/${encodeURIComponent(venueId)}`}
      state={{ returnToSearch }}
    >
      {children}
    </Link>
  );
}

/** Labeled link to the 食べた記録 page; 地図に戻る there returns to this map view. */
export function MealRecordsPageLink() {
  const returnToSearch = useReturnToSearch();
  return (
    <ChakraLink
      to={MEAL_RECORDS_PATH}
      state={{ returnToSearch }}
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="2px"
      px="6px"
      py="4px"
      rounded="nmMd"
      color="nm.ink"
      fontSize="10px"
      flexShrink={0}
      _hover={{ bg: "nm.bg" }}
    >
      <LuBookOpen size={18} aria-hidden="true" />
      食べた記録
    </ChakraLink>
  );
}

export function RecordShopLink({
  shopId,
  children,
}: {
  shopId: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const source =
    location.pathname === "/search"
      ? location
      : searchLocationIn(location.state);
  const params = new URLSearchParams(source?.search);
  params.set("shop", shopId);
  return (
    <Link
      to={{ pathname: "/search", search: `?${params}`, hash: source?.hash }}
      state={
        restoresSearchCamera(source?.state)
          ? searchLocationIn(source?.state)?.state
          : source?.state
      }
    >
      {children}
    </Link>
  );
}

/** 地図に戻る: back to the map view this page was opened from, or the plain map. */
export function BackToMapLink() {
  const location = useLocation();
  const returnToSearch = searchLocationIn(location.state);
  return (
    <Button asChild variant="outline" size="sm">
      <Link
        to={returnToSearch ?? "/search"}
        state={
          returnToSearch
            ? { returnToSearch, restoreSearchCamera: true }
            : undefined
        }
      >
        <LuArrowLeft aria-hidden="true" />
        地図に戻る
      </Link>
    </Button>
  );
}
