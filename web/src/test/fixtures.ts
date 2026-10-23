import { decorateShop, Shop, Tag } from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";

type ApiShop = components["schemas"]["Shop"];

let nextId = 1;

function fixtureUuid() {
  const n = (nextId++).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${n}`;
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: fixtureUuid(),
    label: "醤油",
    slug: "shoyu",
    color: "#8c2e21",
    sortOrder: 0,
    ...overrides,
  };
}

// Builds an API shop and derives the cached date/status fields exactly as the
// app does after fetching, so lifecycle follows openedAt/closedAt.
export function makeShop(overrides: Partial<ApiShop> = {}): Shop {
  const eaten = overrides.eaten ?? true;
  const rate = overrides.rate ?? (eaten ? 80 : 0);
  return decorateShop({
    id: fixtureUuid(),
    name: "麺屋 まる",
    lat: 35.6895,
    lng: 139.7005,
    postalCode: "160-0022",
    address: "東京都新宿区新宿3-1-1",
    eaten,
    rate,
    // The server's お気に入り rule: お気に入り度 of 80 or more, which only an eaten shop has.
    favorite: eaten && rate >= 80,
    visitCount: eaten ? 1 : 0,
    category: "ramen",
    tags: [],
    links: [],
    ...overrides,
  });
}
