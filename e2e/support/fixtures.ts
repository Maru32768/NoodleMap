import {
  type APIRequestContext,
  type APIResponse,
  test as base,
  expect,
} from "@playwright/test";
import { randomBytes } from "node:crypto";
import type { components } from "../../web/src/generated/api.ts";
import { ADMIN_STATE, WEB_HOST } from "./env.ts";

export type Shop = components["schemas"]["Shop"];
export type Tag = components["schemas"]["Tag"];
type TagInput = components["schemas"]["TagInput"];
type AddShopRequest = components["schemas"]["AddShopRequest"];
type UpdateShopRequest = components["schemas"]["UpdateShopRequest"];
type VisitLogInput = components["schemas"]["VisitLogInput"];

/** A short token unique to this run, used to namespace seeded shops and tags. */
export function uid(): string {
  return `e2e${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
}

async function expectOkJson<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} -> ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

/** Seeds and reads data through the real backend API as the E2E admin. */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  async listShops(): Promise<Shop[]> {
    return (await expectOkJson<{ shops: Shop[] }>(await this.request.get("/api/v1/shops"))).shops;
  }

  async getShop(id: string): Promise<Shop> {
    const shop = (await this.listShops()).find((s) => s.id === id);
    expect(shop, `shop ${id}`).toBeDefined();
    return shop!;
  }

  async listTags(): Promise<Tag[]> {
    return (await expectOkJson<{ tags: Tag[] }>(await this.request.get("/api/v1/tags"))).tags;
  }

  /** PUT /auth/tags replaces the whole list, so append to the current one. */
  async addTag(input: Omit<TagInput, "id" | "sortOrder" | "color"> & Partial<TagInput>): Promise<Tag> {
    const current = await this.listTags();
    const res = await this.request.put("/api/v1/auth/tags", {
      data: { tags: [...current, { color: "#2563eb", sortOrder: 100, ...input }] },
    });
    const { tags } = await expectOkJson<{ tags: Tag[] }>(res);
    return tags.find((t) => t.slug === input.slug)!;
  }

  /** Adds a shop near the default map center with its tags; an eaten shop gets one 訪問ログ with the rate. */
  async createShop(
    spec: Pick<AddShopRequest, "name"> &
      Partial<Pick<AddShopRequest, "category" | "tagIds" | "address">> & { eaten?: boolean; rate?: number },
  ): Promise<Shop> {
    const add: AddShopRequest = {
      name: spec.name,
      lat: 35.6895,
      lng: 139.7005,
      postalCode: "160-0022",
      address: spec.address ?? "東京都新宿区新宿3丁目",
      googlePlaceId: `e2e-place-${uid()}`,
      category: spec.category ?? "ramen",
      tagIds: spec.tagIds ?? [],
    };
    const shop = await expectOkJson<Shop>(await this.request.post("/api/v1/auth/shops", { data: add }));
    if (spec.eaten) {
      const visit: VisitLogInput = { isLimitedMenu: false, rate: spec.rate };
      await expectOkJson(await this.request.post(`/api/v1/auth/shops/${shop.id}/visits`, { data: visit }));
    }
    return this.getShop(shop.id);
  }

  async updateShop(shop: Shop, patch: Partial<UpdateShopRequest>): Promise<void> {
    const body: UpdateShopRequest = {
      name: shop.name,
      lat: shop.lat,
      lng: shop.lng,
      postalCode: shop.postalCode,
      address: shop.address,
      openedAt: shop.openedAt,
      closedAt: shop.closedAt,
      googlePlaceId: shop.googlePlaceId,
      category: shop.category,
      tagIds: shop.tags.map((t) => t.id),
      ...patch,
    };
    const res = await this.request.put(`/api/v1/auth/shops/${shop.id}`, { data: body });
    expect(res.ok(), `update ${shop.id} -> ${res.status()} ${await res.text()}`).toBe(true);
  }
}

export const test = base.extend<{ api: Api }>({
  context: async ({ context }, use) => {
    // Hermetic: only the app's own origin (and its /api proxy) is reachable.
    await context.route(
      (url) => url.host !== WEB_HOST,
      (route) => route.abort("blockedbyclient"),
    );
    await use(context);
  },

  api: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE });
    await use(new Api(request));
    await request.dispose();
  },
});

export { expect };
