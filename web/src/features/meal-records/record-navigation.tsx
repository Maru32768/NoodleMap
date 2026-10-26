import { ReactNode } from "react";
import { Link, type Location, useLocation } from "react-router";

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

export function RecordVenueLink({
  venueId,
  children,
}: {
  venueId: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const state: unknown = location.state;
  const returnToSearch =
    location.pathname === "/search"
      ? {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          state: restoresSearchCamera(state)
            ? searchLocationIn(state)?.state
            : state,
        }
      : searchLocationIn(state);
  return (
    <Link
      to={`/venues/${encodeURIComponent(venueId)}`}
      state={{ returnToSearch }}
    >
      {children}
    </Link>
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

export function VenueMapLink() {
  const location = useLocation();
  const returnToSearch = searchLocationIn(location.state);
  return (
    <Link
      to={returnToSearch ?? "/search"}
      state={
        returnToSearch
          ? { returnToSearch, restoreSearchCamera: true }
          : undefined
      }
    >
      地図に戻る
    </Link>
  );
}
