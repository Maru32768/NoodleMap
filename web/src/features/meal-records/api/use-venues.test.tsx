import {
  CurrentUser,
  CurrentUserProvider,
  GUEST_USER,
} from "@/features/auth/use-current-user.ts";
import { useMealRecordImageMutations } from "@/features/meal-records/api/use-meal-record-images.ts";
import {
  MealRecord,
  mealRecordInputOf,
  useMealRecordMutations,
  useMealRecords,
} from "@/features/meal-records/api/use-meal-records.ts";
import {
  useVenueMealRecords,
  useVenues,
} from "@/features/meal-records/api/use-venues.ts";
import { useShops } from "@/features/shops/api/use-shops.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

const admin: CurrentUser = {
  id: "admin",
  email: "admin@example.com",
  type: "admin",
};
const venue = { id: "venue-1", name: "ラーメンWalkerキッチン" };

function History() {
  const history = useVenueMealRecords(venue.id);
  return <output data-testid="history">{JSON.stringify(history.data)}</output>;
}

describe("venue history cache", () => {
  it("keeps admin private notes out of guest history and does not reuse notes after an auth failure", async () => {
    let privateResponse = true;
    let requests = 0;
    server.use(
      http.get("/api/v1/venues/:venueId/meal-records", () => {
        requests++;
        return HttpResponse.json({
          venue,
          mealRecords: [
            {
              id: "record",
              shops: [],
              menuItems: [],
              images: [],
              ...(privateResponse ? { privateNote: "秘密" } : {}),
            },
          ],
        });
      }),
    );
    const view = (user: CurrentUser) => (
      <CurrentUserProvider value={user}>
        <History />
      </CurrentUserProvider>
    );
    const { rerender } = renderWithProviders(view(admin));
    await waitFor(() =>
      expect(screen.getByTestId("history")).toHaveTextContent("秘密"),
    );
    privateResponse = false;
    rerender(view(GUEST_USER));
    expect(screen.getByTestId("history")).not.toHaveTextContent("秘密");
    await waitFor(() => expect(requests).toBe(2));
    await waitFor(() =>
      expect(screen.getByTestId("history")).toHaveTextContent("record"),
    );
    privateResponse = true;
    rerender(view({ type: "guest", authFailed: true }));
    expect(screen.getByTestId("history")).not.toHaveTextContent("秘密");
    await waitFor(() => expect(requests).toBe(3));
  });

  it("refreshes detached shops, linked shops, venue history, suggestions and shop summaries after saving and refreshes both histories after image edits", async () => {
    const a = makeShop({ name: "A" });
    const b = makeShop({ name: "B" });
    let record: MealRecord = {
      id: "record",
      shops: [a, b],
      venue,
      menuItems: [],
      images: [
        { id: "photo", url: "https://example.com/a.jpg", width: 1, height: 1 },
      ],
    };
    const reads = { a: 0, b: 0, venue: 0, venues: 0, shops: 0 };
    server.use(
      http.get("/api/v1/shops/:id/meal-records", ({ params }) => {
        reads[params.id === a.id ? "a" : "b"]++;
        return HttpResponse.json({
          mealRecords: record.shops.some((shop) => shop.id === params.id)
            ? [record]
            : [],
        });
      }),
      http.get("/api/v1/venues/:venueId/meal-records", () => {
        reads.venue++;
        return HttpResponse.json({ venue, mealRecords: [record] });
      }),
      http.get("/api/v1/venues", () => {
        reads.venues++;
        return HttpResponse.json({ venues: [venue] });
      }),
      http.get("/api/v1/shops", () => {
        reads.shops++;
        return HttpResponse.json({ shops: [a, b] });
      }),
      http.put("/api/v1/auth/meal-records/:mealRecordId", () => {
        record = { ...record, shops: [b], publicNote: "変更" };
        return HttpResponse.json(record);
      }),
      http.put("/api/v1/auth/meal-record-images/:imageId", () => {
        record = {
          ...record,
          images: record.images.map((photo) => ({
            ...photo,
            caption: "画像を編集",
          })),
        };
        return HttpResponse.json(record.images[0]);
      }),
    );
    function Views() {
      const one = useMealRecords(a.id);
      const two = useMealRecords(b.id);
      const history = useVenueMealRecords(venue.id);
      useVenues();
      useShops();
      const { updateMealRecord } = useMealRecordMutations();
      const { updateCaption } = useMealRecordImageMutations();
      return (
        <>
          <output data-testid="one">{JSON.stringify(one.mealRecords)}</output>
          <output data-testid="two">{JSON.stringify(two.mealRecords)}</output>
          <output data-testid="venue">{JSON.stringify(history.data)}</output>
          <button
            onClick={() =>
              void updateMealRecord(record.id, {
                ...mealRecordInputOf(record),
                shopIds: [b.id],
              })
            }
          >
            保存
          </button>
          <button onClick={() => void updateCaption("photo", "画像を編集")}>
            画像を編集
          </button>
        </>
      );
    }
    renderWithProviders(
      <CurrentUserProvider value={admin}>
        <Views />
      </CurrentUserProvider>,
    );
    await waitFor(() =>
      expect(Object.values(reads).every((count) => count === 1)).toBe(true),
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.getByTestId("one")).toHaveTextContent("[]"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("two")).toHaveTextContent("変更"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("venue")).toHaveTextContent("変更"),
    );
    await waitFor(() =>
      expect(Object.values(reads).every((count) => count >= 2)).toBe(true),
    );
    await userEvent.click(screen.getByRole("button", { name: "画像を編集" }));
    await waitFor(() =>
      expect(screen.getByTestId("two")).toHaveTextContent("画像を編集"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("venue")).toHaveTextContent("画像を編集"),
    );
    expect(reads.a).toBeGreaterThanOrEqual(3);
  });
});
