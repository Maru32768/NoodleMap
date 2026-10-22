import type { components } from "@/generated/api.ts";

export type ShopLink = components["schemas"]["ShopLink"];
export type ShopLinkInput = components["schemas"]["ShopLinkInput"];
export type ShopLinkType = components["schemas"]["ShopLinkType"];

// Mirrors the server limit (ShopHandler SHOP_LINKS_MAX).
export const SHOP_LINKS_MAX = 10;

export const SHOP_LINK_TYPE_LABEL: Readonly<Record<ShopLinkType, string>> = {
  official: "公式",
  twitter: "Twitter",
  instagram: "Instagram",
  facebook: "Facebook",
  tabelog: "食べログ",
  other: "その他",
};

export const SHOP_LINK_TYPES = Object.keys(
  SHOP_LINK_TYPE_LABEL,
) as ShopLinkType[];

// Subdomains (www., m., mobile., s.) match their parent domain.
const DOMAIN_TYPES: ReadonlyArray<[string, ShopLinkType]> = [
  ["x.com", "twitter"],
  ["twitter.com", "twitter"],
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["tabelog.com", "tabelog"],
];

function parseHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function isHttpUrl(url: string): boolean {
  return parseHttpUrl(url) !== null;
}

export function inferShopLinkType(url: string): ShopLinkType {
  const host = parseHttpUrl(url)?.hostname.toLowerCase();
  if (!host) {
    return "other";
  }
  const match = DOMAIN_TYPES.find(
    ([domain]) => host === domain || host.endsWith(`.${domain}`),
  );
  return match ? match[1] : "other";
}

// Re-infers the type from the new URL unless the admin picked a type that
// differs from what the previous URL implied.
export function withLinkUrl(link: ShopLinkInput, url: string): ShopLinkInput {
  const followsUrl = link.type === inferShopLinkType(link.url);
  return {
    ...link,
    url,
    type: followsUrl ? inferShopLinkType(url) : link.type,
  };
}

export function shopLinkText(link: ShopLink): string {
  if (link.label) {
    return link.label;
  }
  return link.type === "official"
    ? "公式サイト"
    : SHOP_LINK_TYPE_LABEL[link.type];
}

// `links` may be missing while an older server is still deployed; only
// http(s) URLs are ever rendered as links.
export function displayableShopLinks(
  links: readonly ShopLink[] | undefined,
): ShopLink[] {
  return (links ?? []).filter((link) => isHttpUrl(link.url));
}
