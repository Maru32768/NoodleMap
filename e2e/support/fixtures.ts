import {
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
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
type MealRecordInput = components["schemas"]["MealRecordInput"];
export type MealRecord = components["schemas"]["MealRecord"];

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

  /** Adds a shop (near the default map center unless placed) with its tags; an eaten shop gets one 食べた記録 with the rate. */
  async createShop(
    spec: Pick<AddShopRequest, "name"> &
      Partial<Pick<AddShopRequest, "category" | "tagIds" | "address" | "lat" | "lng">> & {
        eaten?: boolean;
        rate?: number;
      },
  ): Promise<Shop> {
    const add: AddShopRequest = {
      name: spec.name,
      lat: spec.lat ?? 35.6895,
      lng: spec.lng ?? 139.7005,
      postalCode: "160-0022",
      address: spec.address ?? "東京都新宿区新宿3丁目",
      googlePlaceId: `e2e-place-${uid()}`,
      category: spec.category ?? "ramen",
      tagIds: spec.tagIds ?? [],
    };
    const shop = await expectOkJson<Shop>(await this.request.post("/api/v1/auth/shops", { data: add }));
    if (spec.eaten) {
      const mealRecord: MealRecordInput = { shopIds: [shop.id], rate: spec.rate };
      await expectOkJson(await this.request.post("/api/v1/auth/meal-records", { data: mealRecord }));
    }
    return this.getShop(shop.id);
  }

  async listMealRecords(shopId: string): Promise<MealRecord[]> {
    const res = await this.request.get(`/api/v1/shops/${shopId}/meal-records`);
    return (await expectOkJson<{ mealRecords: MealRecord[] }>(res)).mealRecords;
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

/** Hermetic: only the app's own origin (and its /api proxy) is reachable. */
async function blockOtherHosts(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.host !== WEB_HOST,
    (route) => route.abort("blockedbyclient"),
  );
}

// Logged by web/src/components/app-error-boundary.tsx.
const ERROR_BOUNDARY_MARKER = "[AppErrorBoundary]";

/**
 * Collects uncaught errors, which unmount the React app and leave a blank page,
 * and errors AppErrorBoundary caught, which replace the page with its fallback.
 */
function collectAppErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().startsWith(ERROR_BOUNDARY_MARKER)) {
      errors.push(message.text());
    }
  });
  return errors;
}

export const test = base.extend<{
  api: Api;
  /** Runs `fn` with a signed-out page that can only reach the app. */
  asGuest: (fn: (page: Page) => Promise<void>) => Promise<void>;
}>({
  context: async ({ context }, use) => {
    await blockOtherHosts(context);
    await use(context);
  },

  page: async ({ page }, use) => {
    const errors = collectAppErrors(page);
    await use(page);
    expect(errors, "app errors").toEqual([]);
  },

  asGuest: async ({ browser, baseURL }, use) => {
    await use(async (fn) => {
      const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      try {
        await blockOtherHosts(guest);
        const page = await guest.newPage();
        const errors = collectAppErrors(page);
        await fn(page);
        expect(errors, "app errors on the guest page").toEqual([]);
      } finally {
        await guest.close();
      }
    });
  },

  api: async ({ playwright, baseURL }, use) => {
    const request = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE });
    await use(new Api(request));
    await request.dispose();
  },
});

export { expect };
