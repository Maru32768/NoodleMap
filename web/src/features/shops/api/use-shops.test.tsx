import { Shop, useShops, useTags } from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { act, screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

type ApiShop = components["schemas"]["Shop"];

// A not-eaten shop with a fixed id, so the update tests can address it.
function apiShop(overrides: Partial<ApiShop>): Shop {
  return makeShop({
    id: "00000000-0000-4000-8000-0000000000a1",
    eaten: false,
    rate: 0,
    ...overrides,
  });
}

const addCommand = {
  name: "新しい店",
  lat: 35.7,
  lng: 139.7,
  postalCode: "160-0022",
  address: "東京都新宿区",
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

  it("normalizes links in the optimistic update and keeps them when omitted", async () => {
    let gets = 0;
    server.use(
      http.get("/api/v1/shops", async () => {
        // Hold the revalidation so the optimistic cache stays observable.
        if (gets++ > 0) {
          await delay("infinite");
        }
        return HttpResponse.json({
          shops: [
            apiShop({
              links: [{ type: "official", url: "https://a.example/" }],
            }),
          ],
        });
      }),
      http.put(
        "/api/v1/auth/shops/00000000-0000-4000-8000-0000000000a1",
        () => new HttpResponse(null, { status: 200 }),
      ),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toHaveLength(1));
    const id = "00000000-0000-4000-8000-0000000000a1";

    await act(async () => {
      await result.current.updateShop(id, {
        ...addCommand,
        eaten: false,
        rate: 0,
      });
    });
    expect(result.current.shops?.[0].links).toEqual([
      { type: "official", url: "https://a.example/" },
    ]);

    await act(async () => {
      await result.current.updateShop(id, {
        ...addCommand,
        eaten: false,
        rate: 0,
        links: [
          { type: "twitter", label: " ", url: " https://x.com/a " },
          { type: "other", label: " 本店 ", url: "https://b.example/" },
        ],
      });
    });
    expect(result.current.shops?.[0].links).toStrictEqual([
      { type: "twitter", label: undefined, url: "https://x.com/a" },
      { type: "other", label: "本店", url: "https://b.example/" },
    ]);
  });

  it("mirrors the server's Google Place ID rules in the optimistic update", async () => {
    let gets = 0;
    server.use(
      http.get("/api/v1/shops", async () => {
        // Hold the revalidation so the optimistic cache stays observable.
        if (gets++ > 0) {
          await delay("infinite");
        }
        return HttpResponse.json({
          shops: [apiShop({ googlePlaceId: "place-1" })],
        });
      }),
      http.put(
        "/api/v1/auth/shops/00000000-0000-4000-8000-0000000000a1",
        () => new HttpResponse(null, { status: 200 }),
      ),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toHaveLength(1));
    const id = "00000000-0000-4000-8000-0000000000a1";
    const update = (googlePlaceId: string | undefined) =>
      act(async () => {
        await result.current.updateShop(id, {
          ...addCommand,
          googlePlaceId,
          eaten: false,
          rate: 0,
        });
      });

    await update(undefined);
    expect(result.current.shops?.[0].googlePlaceId).toBe("place-1");

    await update(" place-2 ");
    expect(result.current.shops?.[0].googlePlaceId).toBe("place-2");

    await update(" ");
    expect(result.current.shops?.[0].googlePlaceId).toBeUndefined();
  });

  it("drops a shop that the update reports as not found", async () => {
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ shops: [apiShop({ name: "gone" })] }),
      ),
      http.put("/api/v1/auth/shops/00000000-0000-4000-8000-0000000000a1", () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
      ),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toHaveLength(1));

    let outcome: Awaited<ReturnType<typeof result.current.updateShop>>;
    await act(async () => {
      outcome = await result.current.updateShop(
        "00000000-0000-4000-8000-0000000000a1",
        { ...addCommand, eaten: false, rate: 0 },
      );
    });

    expect(outcome!).toMatchObject({ ok: false, error: { type: "not_found" } });
    expect(result.current.shops).toEqual([]);
  });

  it("reports a non-OK response with an empty body as an error", async () => {
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ shops: [apiShop({ name: "kept" })] }),
      ),
      http.delete(
        "/api/v1/auth/shops/00000000-0000-4000-8000-0000000000a1",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { result } = renderHookWithProviders(() => useShops());
    await waitFor(() => expect(result.current.shops).toHaveLength(1));

    const outcome = await result.current.deleteShop(
      "00000000-0000-4000-8000-0000000000a1",
    );

    expect(outcome).toMatchObject({ ok: false, error: { status: 500 } });
    expect(result.current.shops).toHaveLength(1);
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

describe("useTags", () => {
  it("toasts a failed load and exposes no tags", async () => {
    server.use(
      http.get("/api/v1/tags", () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
      ),
    );

    const { result } = renderHookWithProviders(() =>
      useTags({ shouldRetryOnError: false }),
    );

    expect(
      await screen.findByText("タグ一覧を読み込めませんでした"),
    ).toBeInTheDocument();
    expect(result.current.tags).toBeUndefined();
  });

  it("returns a rejected save as an error and keeps the cached tags", async () => {
    const tag = makeTag({ label: "醤油" });
    server.use(
      http.get("/api/v1/tags", () => HttpResponse.json({ tags: [tag] })),
      http.put("/api/v1/auth/tags", () =>
        HttpResponse.json({ type: "permission_denied" }, { status: 403 }),
      ),
    );
    const { result } = renderHookWithProviders(() => useTags());
    await waitFor(() => expect(result.current.tags).toEqual([tag]));

    let outcome: Awaited<ReturnType<typeof result.current.saveTags>>;
    await act(async () => {
      outcome = await result.current.saveTags([]);
    });

    expect(outcome!).toMatchObject({
      ok: false,
      error: { status: 403, type: "permission_denied" },
    });
    expect(result.current.tags).toEqual([tag]);
  });
});
