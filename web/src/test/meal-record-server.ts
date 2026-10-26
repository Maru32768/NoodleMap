import type {
  MealRecord,
  MealRecordInput,
} from "@/features/meal-records/api/use-meal-records.ts";
import { server } from "@/test/server.ts";
import { http, HttpResponse } from "msw";

/**
 * A stateful fake of the meal record endpoints the photo import calls: list a shop's
 * meal records, add one, replace one, add an image. `log` records every write.
 */
export function fakeMealRecordServer(
  initial: Record<string, MealRecord[]> = {},
) {
  const mealRecords = new Map(
    Object.entries(initial).map(([shopId, list]) => [shopId, [...list]]),
  );
  const log: string[] = [];
  let nextId = 1;
  const newId = () =>
    `00000000-0000-4000-9000-${(nextId++).toString(16).padStart(12, "0")}`;
  const find = (mealRecordId: string) =>
    [...mealRecords.values()].flat().find((v) => v.id === mealRecordId);
  const fields = (input: MealRecordInput) => ({
    eatenOn: input.eatenOn,
    menuItems: (input.menuItems ?? []).map((item) => ({
      name: item.name,
      isLimited: item.isLimited ?? false,
      price: item.price,
    })),
    rate: input.rate,
    shops: input.shopIds.map((id) => ({ id, name: id })),
    venue: input.venueName
      ? { id: "venue-1", name: input.venueName }
      : undefined,
    publicNote: input.publicNote,
    privateNote: input.privateNote,
  });

  /**
   * Stores an uploaded image at the end of the meal record's images, logged by its
   * position (`image 3` is the meal record's third). The multipart body cannot be
   * read under jsdom, so which photo it was is unknown.
   */
  function saveImage({ params }: { params: { mealRecordId?: unknown } }) {
    const mealRecord = find(params.mealRecordId as string)!;
    const image = {
      id: newId(),
      url: `https://img.example/${newId()}.jpg`,
      width: 2048,
      height: 1536,
    };
    mealRecord.images.push(image);
    log.push(`image ${mealRecord.images.length}`);
    return image;
  }

  server.use(
    http.get("/api/v1/shops/:id/meal-records", ({ params }) =>
      HttpResponse.json({
        mealRecords: structuredClone(
          mealRecords.get(params.id as string) ?? [],
        ),
      }),
    ),
    http.post("/api/v1/auth/meal-records", async ({ request }) => {
      const input = (await request.json()) as MealRecordInput;
      const mealRecord: MealRecord = {
        id: newId(),
        images: [],
        ...fields(input),
      };
      const shopId = input.shopIds[0];
      mealRecords.set(shopId, [...(mealRecords.get(shopId) ?? []), mealRecord]);
      log.push(`create ${input.eatenOn}`);
      return HttpResponse.json(mealRecord);
    }),
    http.put(
      "/api/v1/auth/meal-records/:mealRecordId",
      async ({ params, request }) => {
        const mealRecord = find(params.mealRecordId as string);
        if (!mealRecord) {
          return HttpResponse.json({ type: "not_found" }, { status: 404 });
        }
        const input = (await request.json()) as MealRecordInput;
        Object.assign(mealRecord, fields(input));
        log.push(`update ${JSON.stringify(input)}`);
        return HttpResponse.json(mealRecord);
      },
    ),
    http.post("/api/v1/auth/meal-records/:mealRecordId/images", (info) =>
      HttpResponse.json(saveImage(info)),
    ),
  );

  return {
    log,
    saveImage,
    mealRecordsOf: (shopId: string) => mealRecords.get(shopId) ?? [],
  };
}
