import {
  MealRecord,
  mealRecordInputOf,
  putMealRecord,
} from "@/features/meal-records/api/use-meal-records.ts";
import { server } from "@/test/server.ts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

// What the server received, as JSON.
function capturePut(response: MealRecord) {
  const bodies: unknown[] = [];
  server.use(
    http.put("/api/v1/auth/meal-records/:mealRecordId", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(response);
    }),
  );
  return bodies;
}

describe("mealRecordInputOf", () => {
  it("sends every field of the meal record back through a PUT", async () => {
    const mealRecord: MealRecord = {
      id: "00000000-0000-4000-8000-0000000000a1",
      eatenOn: "2023-04-01",
      shops: [
        { id: "shop-a", name: "A" },
        { id: "shop-b", name: "B" },
      ],
      menuItems: [
        { name: "特製中華そば", isLimited: true, price: 1200 },
        { name: "味玉", isLimited: false },
      ],
      totalPrice: 1200,
      rate: 85,
      venue: { id: "venue-1", name: "ラーメン博" },
      publicNote: "公開メモ",
      privateNote: "自分用メモ",
      images: [
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          url: "https://example.com/a.jpg",
          width: 640,
          height: 480,
        },
      ],
    };
    const bodies = capturePut(mealRecord);

    await putMealRecord(mealRecord.id, mealRecordInputOf(mealRecord));

    expect(bodies).toEqual([
      {
        shopIds: ["shop-a", "shop-b"],
        eatenOn: "2023-04-01",
        menuItems: [
          { name: "特製中華そば", isLimited: true, price: 1200 },
          { name: "味玉", isLimited: false },
        ],
        rate: 85,
        venueName: "ラーメン博",
        publicNote: "公開メモ",
        privateNote: "自分用メモ",
      },
    ]);
  });

  it("leaves out what a dateless, unrated meal record does not have", async () => {
    const mealRecord: MealRecord = {
      id: "00000000-0000-4000-8000-0000000000a2",
      shops: [
        { id: "shop-a", name: "A" },
        { id: "shop-b", name: "B" },
      ],
      menuItems: [],
      images: [],
    };
    const bodies = capturePut(mealRecord);

    await putMealRecord(mealRecord.id, mealRecordInputOf(mealRecord));

    expect(bodies).toEqual([{ shopIds: ["shop-a", "shop-b"], menuItems: [] }]);
  });
});
