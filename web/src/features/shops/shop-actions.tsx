import { LoadableButton } from "@/components/loadable-button.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toaster } from "@/components/ui/toaster.tsx";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { shopShareUrl } from "@/utils/path.ts";
import { toastError } from "@/utils/toast.ts";
import { Link } from "@chakra-ui/react";
import { LuExternalLink, LuSettings, LuShare2 } from "react-icons/lu";

export function buildGoogleMapsUrl(r: Shop) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${r.name} ${r.address}`);
  if (r.googlePlaceId) {
    url.searchParams.set("query_place_id", r.googlePlaceId);
  }
  return url.toString();
}

// Native share sheet on touch devices; desktop browsers that expose
// navigator.share get a plain clipboard copy instead.
export async function shareShop(shop: Pick<Shop, "id" | "name">) {
  const url = shopShareUrl(shop.id);
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: shop.name, url });
    } catch (e) {
      // Cancelling the share sheet rejects with AbortError. Other failures do
      // not fall back to the clipboard: user activation is gone by now.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        toastError({ title: "共有できませんでした" });
      }
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toaster.success({ description: "URLをコピーしました" });
  } catch {
    toastError({ title: "URLをコピーできませんでした" });
  }
}

const actionBtnBase = {
  flex: "1 0 auto",
  minW: "auto" as const,
  minH: "auto" as const,
  h: "auto",
  px: { base: "0.5rem", md: "0.875rem" },
  py: "0.6875rem",
  borderRadius: "nmMd",
  fontSize: "0.8125rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  _icon: { width: "1.25rem", height: "1.25rem", flexShrink: 0 },
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.375rem",
  transition: "all 0.15s",
} as const;

export function ShopActions({
  shop,
  mapsUrl,
  mapsLabel,
  onAdminClick,
}: {
  shop: Pick<Shop, "id" | "name">;
  mapsUrl: string;
  mapsLabel: string;
  onAdminClick?: () => void;
}) {
  const actionBtnProps = {
    ...actionBtnBase,
    flexBasis: onAdminClick ? "auto" : "0",
  };

  return (
    <>
      <Link
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        {...actionBtnProps}
        bg="nm.bg"
        color="nm.ink"
        border="1px solid"
        borderColor="nm.line"
        textDecoration="none"
        _hover={{ borderColor: "nm.ink", textDecoration: "none" }}
      >
        <LuExternalLink aria-hidden="true" />
        {mapsLabel}
      </Link>
      <LoadableButton
        onClick={() => shareShop(shop)}
        variant="plain"
        {...actionBtnProps}
        bg="nm.bg"
        color="nm.ink"
        border="1px solid"
        borderColor="nm.line"
        _hover={{ borderColor: "nm.ink" }}
      >
        <LuShare2 aria-hidden="true" />
        共有
      </LoadableButton>
      {onAdminClick && (
        <Button
          onClick={onAdminClick}
          variant="plain"
          {...actionBtnProps}
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

export function ShopAddressLink({
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
