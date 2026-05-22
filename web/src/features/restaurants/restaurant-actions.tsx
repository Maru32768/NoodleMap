import { Button } from "@/components/ui/button.tsx";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { Link } from "@chakra-ui/react";
import { LuExternalLink, LuSettings } from "react-icons/lu";

export function buildGoogleMapsUrl(r: Restaurant) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${r.name} ${r.address}`);
  if (r.googlePlaceId) {
    url.searchParams.set("query_place_id", r.googlePlaceId);
  }
  return url.toString();
}

const actionBtnBase = {
  flex: "1",
  minW: "auto" as const,
  minH: "auto" as const,
  px: "0.875rem",
  py: "0.6875rem",
  borderRadius: "nmMd",
  fontSize: "0.8125rem",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.375rem",
  transition: "all 0.15s",
} as const;

export function RestaurantActions({
  mapsUrl,
  mapsLabel,
  onAdminClick,
}: {
  mapsUrl: string;
  mapsLabel: string;
  onAdminClick?: () => void;
}) {
  return (
    <>
      <Link
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        {...actionBtnBase}
        bg="nm.bg"
        color="nm.ink"
        border="1px solid"
        borderColor="nm.line"
        textDecoration="none"
        _hover={{ borderColor: "nm.ink", textDecoration: "none" }}
      >
        {mapsLabel}
      </Link>
      {onAdminClick && (
        <Button
          onClick={onAdminClick}
          variant="plain"
          {...actionBtnBase}
          bg="nm.ink"
          color="nm.paper"
          textDecoration="none"
          _hover={{ bg: "nm.inkSoft", textDecoration: "none" }}
        >
          <LuSettings aria-hidden="true" />
          編集
        </Button>
      )}
    </>
  );
}

export function RestaurantAddressLink({
  address,
  mapsUrl,
}: {
  address: string;
  mapsUrl: string;
}) {
  return (
    <Link
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      color="#2563eb"
      textDecoration="underline"
      textDecorationColor="rgba(37, 99, 235, 0.42)"
      textUnderlineOffset="0.1875rem"
      display="inline-flex"
      alignItems="center"
      gap="0.25rem"
      _hover={{
        color: "#1d4ed8",
        textDecorationColor: "currentColor",
      }}
    >
      {address}
      <LuExternalLink aria-hidden="true" size={12} />
    </Link>
  );
}
