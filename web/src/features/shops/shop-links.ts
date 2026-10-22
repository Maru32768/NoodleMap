import type { components } from "@/generated/api.ts";

export type ShopLink = components["schemas"]["ShopLink"];
export type ShopLinkInput = components["schemas"]["ShopLinkInput"];
export type ShopLinkType = components["schemas"]["ShopLinkType"];

// Mirror the server limits (ShopHandler SHOP_LINKS_MAX etc.).
export const SHOP_LINKS_MAX = 10;
export const SHOP_LINK_URL_MAX_LENGTH = 2048;
export const SHOP_LINK_LABEL_MAX_LENGTH = 100;

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

// WHATWG URL plus the server's extra rules: http(s) with a host, no userinfo,
// no port 0. The server (ShopHandler isHttpUrl) is stricter in places (it
// needs "//", has no IPv6 hosts, only dotted-decimal IPv4), so everything it
// stores passes here, but a URL passing here can still be rejected on save.
function parseHttpUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const ok =
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.hostname !== "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port !== "0";
  return ok ? parsed : null;
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
export function withLinkUrl<T extends ShopLinkInput>(link: T, url: string): T {
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
  // A newer server may send a type this (possibly cached PWA) build doesn't know.
  return link.type === "official"
    ? "公式サイト"
    : (SHOP_LINK_TYPE_LABEL[link.type] ?? SHOP_LINK_TYPE_LABEL.other);
}

// `links` may be missing while an older server is still deployed; only
// http(s) URLs are ever rendered as links.
export function displayableShopLinks(
  links: readonly ShopLink[] | undefined,
): ShopLink[] {
  return (links ?? []).filter((link) => isHttpUrl(link.url));
}

export type ShopLinkProblem =
  | {
      kind: "missing_url" | "invalid_url" | "url_too_long" | "label_too_long";
      // 1-based, as the edit modal labels its rows.
      row: number;
    }
  | { kind: "too_many" };

const isBlank = (value: string | undefined) => !value?.trim();

// The first problem in the edited rows, or null. Rows without a URL or label
// are not a problem; they are dropped on save.
export function findShopLinkProblem(
  links: readonly ShopLinkInput[],
): ShopLinkProblem | null {
  for (const [i, link] of links.entries()) {
    const row = i + 1;
    if (isBlank(link.url)) {
      if (!isBlank(link.label)) {
        return { kind: "missing_url", row };
      }
      continue;
    }
    const url = link.url.trim();
    if (url.length > SHOP_LINK_URL_MAX_LENGTH) {
      return { kind: "url_too_long", row };
    }
    if (!isHttpUrl(url)) {
      return { kind: "invalid_url", row };
    }
    if ((link.label?.trim().length ?? 0) > SHOP_LINK_LABEL_MAX_LENGTH) {
      return { kind: "label_too_long", row };
    }
  }
  if (links.filter((link) => !isBlank(link.url)).length > SHOP_LINKS_MAX) {
    return { kind: "too_many" };
  }
  return null;
}

// What the edit modal sends: rows without a URL dropped, editor-only fields stripped.
export function savableShopLinks(
  links: readonly ShopLinkInput[],
): ShopLinkInput[] {
  return links
    .filter((link) => !isBlank(link.url))
    .map(({ type, label, url }) => ({ type, label, url }));
}
