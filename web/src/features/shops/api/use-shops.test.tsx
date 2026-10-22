import {
  isDuplicatePlaceIdError,
  useShops,
} from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

type ApiShop = components["schemas"]["Shop"];

function apiShop(overrides: Partial<ApiShop>): ApiShop {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    name: "麺屋 まる",
    lat: 35.69,
    lng: 139.7,
    postalCode: "160-0022",
    address: "東京都新宿区",
    googlePlaceId: "",
    eaten: false,
    rate: 0,
    favorite: false,
    category: "ramen",
    tags: [],
    ...overrides,
  };
}

const addCommand = {
  name: "新しい店",
  lat: 35.7,
  lng: 139.7,
  postalCode: "160-0022",
  address: "東京都新宿区",
  googlePlaceId: "",
  category: "udon" as const,
  tagIds: [],
};

describe("useShops", () => {
  it("loads shops and derives their status from the API dates", async () => {
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({
          shops: [
            apiShop({ name: "closed", closedAt: "2000-01-01", eaten: true }),
            apiShop({ name: "bad date", openedAt: "2025-02-30" }),
          ],
        }),
      ),
    );

    const { result } = renderHookWithProviders(() => useShops());

    await waitFor(() => expect(result.current.shops).toHaveLength(2));
    const [closed, badDate] = result.current.shops!;
    expect(closed).toMatchObject({
      lifecycleStatus: "closed",
      recencyStatus: "regular",
      eatenStatus: "eaten",
    });
    expect(badDate.openedAtDate).toBeNull();
    expect(badDate.lifecycleStatus).toBe("open");
  });

  it("exposes the load error instead of shops when the request fails", async () => {
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
      ),
    );

    const { result } = renderHookWithProviders(() =>
      useShops({ shouldRetryOnError: false }),
    );

    await waitFor(() =>
      expect(result.current.error).toMatchObject({ status: 500 }),
    );
    expect(result.current.isValidating).toBe(false);
    expect(result.current.shops).toBeUndefined();
  });

  it("toasts a failed revalidation while keeping the stale shops", async () => {
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ shops: [apiShop({ name: "stale" })] }),
      ),
    );
    const { result } = renderHookWithProviders(() =>
      useShops({ shouldRetryOnError: false }),
    );
    await waitFor(() => expect(result.current.shops).toHaveLength(1));

    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
      ),
    );
    await act(async () => {
      await result.current.mutate();
    });

    expect(
      await screen.findByText("店舗一覧を読み込めませんでした"),
    ).toBeInTheDocument();
    expect(result.current.shops?.map((shop) => shop.name)).toEqual(["stale"]);
  });

  it("appends an added shop to the cached list", async () => {
    let received: unknown;
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ shops: [apiShop({ name: "existing" })] }),
      ),
      http.post("/api/v1/auth/shops", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          apiShop({
            id: "00000000-0000-4000-8000-0000000000b2",
            name: "新しい店",
            category: "udon",
          }),
        );
      }),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toHaveLength(1));

    let outcome: Awaited<ReturnType<typeof result.current.addShop>>;
    await act(async () => {
      outcome = await result.current.addShop(addCommand);
    });

    expect(received).toEqual(addCommand);
    expect(outcome!.ok).toBe(true);
    expect(result.current.shops?.map((shop) => shop.name)).toEqual([
      "existing",
      "新しい店",
    ]);
  });

  it("removes a deleted shop from the cached list", async () => {
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({
          shops: [
            apiShop({ name: "kept" }),
            apiShop({
              id: "00000000-0000-4000-8000-0000000000c3",
              name: "deleted",
            }),
          ],
        }),
      ),
      http.delete(
        "/api/v1/auth/shops/00000000-0000-4000-8000-0000000000c3",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toHaveLength(2));

    let outcome: Awaited<ReturnType<typeof result.current.deleteShop>>;
    await act(async () => {
      outcome = await result.current.deleteShop(
        "00000000-0000-4000-8000-0000000000c3",
      );
    });

    expect(outcome!.ok).toBe(true);
    expect(result.current.shops?.map((shop) => shop.name)).toEqual(["kept"]);
  });

  it("returns field errors from a rejected add without throwing", async () => {
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: [] })),
      http.post("/api/v1/auth/shops", () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [{ field: "name", type: "required" }],
          },
          { status: 400 },
        ),
      ),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toEqual([]));

    const outcome = await result.current.addShop(addCommand);

    expect(outcome).toMatchObject({
      ok: false,
      error: {
        status: 400,
        type: "invalid_request",
        body: { fieldErrors: [{ field: "name", type: "required" }] },
      },
    });
  });

  it("reports a network failure on add as a status 0 error", async () => {
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: [] })),
      http.post("/api/v1/auth/shops", () => HttpResponse.error()),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toEqual([]));

    const outcome = await result.current.addShop(addCommand);

    expect(!outcome.ok && outcome.error.status).toBe(0);
  });
});

describe("isDuplicatePlaceIdError", () => {
  it("matches only a duplicate googlePlaceId field error", () => {
    expect(
      isDuplicatePlaceIdError({
        type: "invalid_request",
        fieldErrors: [{ field: "googlePlaceId", type: "duplicate" }],
      }),
    ).toBe(true);
    expect(
      isDuplicatePlaceIdError({
        type: "invalid_request",
        fieldErrors: [{ field: "tagIds", type: "unknown" }],
      }),
    ).toBe(false);
    expect(isDuplicatePlaceIdError({ type: "invalid_request" })).toBe(false);
    expect(isDuplicatePlaceIdError(undefined)).toBe(false);
  });
});
