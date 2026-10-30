import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import type { IsoDate } from "@/features/meal-records/eaten-date.ts";
import {
  ImportPlan,
  mealRecordKey,
  PlanEntry,
} from "@/features/photo-import/import-plan.ts";
import type { RunProgress } from "@/features/photo-import/import-state.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import { runImport } from "@/features/photo-import/run-import.ts";
import { fakeMealRecordServer } from "@/test/meal-record-server.ts";
import { server } from "@/test/server.ts";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

const SHOP_A = "00000000-0000-4000-8000-00000000000a";
const SHOP_B = "00000000-0000-4000-8000-00000000000b";
const IMAGES = "/api/v1/auth/meal-records/:mealRecordId/images";

let nextIndex = 0;
const photo = (
  file = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" }),
): Photo => ({
  index: nextIndex++,
  file,
  capturedAt: new Date(),
  dateSource: "exif",
  location: null,
});

function entry(shopId: string, day: string, photoCount: number): PlanEntry {
  return {
    key: mealRecordKey({ kind: "shop", shopId }, day as IsoDate),
    target: { kind: "shop", shopId },
    day: day as IsoDate,
    photos: Array.from({ length: photoCount }, () => photo()),
    overflow: 0,
    claimsDateless: true,
    details: undefined,
  };
}

const plan = (...entries: PlanEntry[]): ImportPlan => ({ entries });

const run = (p: ImportPlan) =>
  runImport(p, { signal: new AbortController().signal, onProgress: () => {} });

function mealRecordWithImages(
  eatenOn: string | undefined,
  count = 0,
): MealRecord {
  return {
    id: crypto.randomUUID(),
    eatenOn,
    shops: [{ id: SHOP_A, name: "A" }],
    menuItems: [],
    images: Array.from({ length: count }, () => ({
      id: crypto.randomUUID(),
      url: "https://img.example/old.jpg",
      width: 1,
      height: 1,
    })),
  };
}

describe("runImport", () => {
  it("imports each shop's photos when an existing collaboration has images on the same day", async () => {
    const shared = {
      ...mealRecordWithImages("2023-04-01", 2),
      shops: [
        { id: SHOP_A, name: "A" },
        { id: SHOP_B, name: "B" },
      ],
    };
    const fake = fakeMealRecordServer({
      [SHOP_A]: [shared],
      [SHOP_B]: [shared],
    });
    const outcome = await run(
      plan(entry(SHOP_A, "2023-04-01", 1), entry(SHOP_B, "2023-04-01", 1)),
    );
    expect(fake.log).toEqual([
      "create 2023-04-01",
      "image 1",
      "create 2023-04-01",
      "image 1",
    ]);
    expect(outcome.progress).toMatchObject({
      created: 2,
      uploadedImages: 2,
      alreadyDone: 0,
    });
    expect(shared.images).toHaveLength(2);
  });
  it("creates each meal record dated on its day and uploads its photos in order", async () => {
    const fake = fakeMealRecordServer();

    const outcome = await run(
      plan(entry(SHOP_A, "2023-04-01", 2), entry(SHOP_B, "2023-04-02", 1)),
    );

    expect(fake.log).toEqual([
      "create 2023-04-01",
      "image 1",
      "image 2",
      "create 2023-04-02",
      "image 1",
    ]);
    expect(outcome).toMatchObject({
      kind: "finished",
      progress: {
        total: 2,
        finished: 2,
        created: 2,
        uploadedImages: 3,
        failures: [],
        current: null,
      },
    });
  });

  it("creates and uploads nothing more when the same plan runs again", async () => {
    const fake = fakeMealRecordServer();
    const p = plan(
      entry(SHOP_A, "2023-04-01", 2),
      entry(SHOP_B, "2023-04-02", 1),
    );
    await run(p);
    const writes = [...fake.log];

    const again = await run(p);

    expect(fake.log).toEqual(writes);
    expect(again).toMatchObject({
      kind: "finished",
      progress: { finished: 2, alreadyDone: 2, created: 0, uploadedImages: 0 },
    });
  });

  it("uploads only the missing photos of a meal record that has 2 of its 4", async () => {
    const fake = fakeMealRecordServer({
      [SHOP_A]: [mealRecordWithImages("2023-04-01", 2)],
    });

    // The photo each upload sent, as the progress line counts it.
    const sent: number[] = [];

    const outcome = await runImport(plan(entry(SHOP_A, "2023-04-01", 4)), {
      signal: new AbortController().signal,
      onProgress: (p) => {
        if (p.uploadedImages > sent.length) {
          sent.push(p.current!.uploaded);
        }
      },
    });

    expect(fake.log).toEqual(["image 3", "image 4"]);
    expect(sent).toEqual([3, 4]);
    expect(outcome.progress).toMatchObject({ resumed: 1, uploadedImages: 2 });
  });

  it("dates a dateless meal record with a PUT that carries every one of its fields", async () => {
    const dateless: MealRecord = {
      ...mealRecordWithImages(undefined),
      shops: [{ id: SHOP_A, name: "A" }],
      menuItems: [{ name: "中華そば", isLimited: true, price: 900 }],
      rate: 70,
      venue: { id: "venue-1", name: "催事" },
      publicNote: "旧アプリ",
      privateNote: "非公開",
    };
    const fake = fakeMealRecordServer({ [SHOP_A]: [dateless] });

    const outcome = await run(plan(entry(SHOP_A, "2023-04-01", 1)));

    expect(fake.log).toEqual([
      `update ${JSON.stringify({
        shopIds: [SHOP_A],
        eatenOn: "2023-04-01",
        menuItems: [{ name: "中華そば", isLimited: true, price: 900 }],
        rate: 70,
        venueName: "催事",
        publicNote: "旧アプリ",
        privateNote: "非公開",
      })}`,
      "image 1",
    ]);
    expect(fake.mealRecordsOf(SHOP_A)).toHaveLength(1);
    expect(outcome.progress).toMatchObject({ claimed: 1, created: 0 });
  });

  it("creates a meal record with the details the admin wrote", async () => {
    const fake = fakeMealRecordServer();

    await run(
      plan({
        ...entry(SHOP_A, "2023-04-01", 1),
        details: {
          shopIds: [SHOP_A],
          menuItems: [{ name: "つけ麺", price: 1000 }],
          rate: 80,
          publicNote: "濃厚",
        },
      }),
    );

    expect(fake.mealRecordsOf(SHOP_A)).toMatchObject([
      {
        eatenOn: "2023-04-01",
        menuItems: [{ name: "つけ麺", isLimited: false, price: 1000 }],
        rate: 80,
        publicNote: "濃厚",
      },
    ]);
  });

  it("creates a collaboration once, apart from the shop's own meal record that day", async () => {
    const fake = fakeMealRecordServer({
      [SHOP_A]: [mealRecordWithImages("2023-04-01", 1)],
    });
    const p = plan({
      ...entry(SHOP_A, "2023-04-01", 1),
      details: { shopIds: [SHOP_A, SHOP_B] },
    });

    await run(p);
    const again = await run(p);

    expect(fake.log).toEqual(["create 2023-04-01", "image 1"]);
    expect(fake.mealRecordsOf(SHOP_A)[1].shops.map((s) => s.id)).toEqual([
      SHOP_A,
      SHOP_B,
    ]);
    expect(again.progress).toMatchObject({ alreadyDone: 1 });
  });

  it("dates a dateless meal record keeping the fields the admin left blank", async () => {
    const dateless: MealRecord = {
      ...mealRecordWithImages(undefined),
      rate: 70,
      publicNote: "旧アプリ",
    };
    const fake = fakeMealRecordServer({ [SHOP_A]: [dateless] });

    await run(
      plan({
        ...entry(SHOP_A, "2023-04-01", 1),
        details: { shopIds: [SHOP_A], rate: 90, publicNote: undefined },
      }),
    );

    expect(fake.mealRecordsOf(SHOP_A)).toMatchObject([
      { eatenOn: "2023-04-01", rate: 90, publicNote: "旧アプリ" },
    ]);
  });

  it("looks again after an upload cut off at status 0 and does not resend a photo the server saved", async () => {
    const fake = fakeMealRecordServer();
    let uploads = 0;
    server.use(
      http.post(IMAGES, (info) => {
        if (++uploads !== 2) {
          return undefined;
        }
        // Saved, but the response never arrives.
        fake.saveImage(info);
        return HttpResponse.error();
      }),
    );

    const outcome = await run(plan(entry(SHOP_A, "2023-04-01", 3)));

    expect(fake.log).toEqual([
      "create 2023-04-01",
      "image 1",
      "image 2",
      "image 3",
    ]);
    expect(outcome).toMatchObject({
      kind: "finished",
      progress: { created: 1, failures: [] },
    });
  });

  it("waits out a busy server and sends the same photo again", async () => {
    const fake = fakeMealRecordServer();
    const busy = () =>
      HttpResponse.json(
        { type: "meal_record_image_processing_busy" },
        { status: 503, headers: { "Retry-After": "0" } },
      );
    // Each try is two requests (uploadMealRecordImage retries once itself): the third try gets through.
    for (let i = 0; i < 4; i++) {
      server.use(http.post(IMAGES, busy, { once: true }));
    }

    const outcome = await run(plan(entry(SHOP_A, "2023-04-01", 1)));

    expect(fake.log).toEqual(["create 2023-04-01", "image 1"]);
    expect(outcome.progress.failures).toEqual([]);
  });

  it("ends unauthorized when the session is gone, without trying the next entry", async () => {
    const fake = fakeMealRecordServer();
    let posts = 0;
    server.use(
      http.post("/api/v1/auth/meal-records", () => {
        posts++;
        return HttpResponse.json(
          { type: "authentication_required" },
          { status: 401 },
        );
      }),
    );

    const outcome = await run(
      plan(entry(SHOP_A, "2023-04-01", 1), entry(SHOP_B, "2023-04-02", 1)),
    );

    expect(outcome.kind).toBe("unauthorized");
    expect(posts).toBe(1);
    expect(fake.log).toEqual([]);
  });

  it("records a failing entry and still runs the next", async () => {
    const fake = fakeMealRecordServer();
    server.use(
      http.post(
        "/api/v1/auth/meal-records",
        () => HttpResponse.json({ type: "internal_error" }, { status: 500 }),
        { once: true },
      ),
    );

    const outcome = await run(
      plan(entry(SHOP_A, "2023-04-01", 1), entry(SHOP_B, "2023-04-02", 1)),
    );

    expect(fake.log).toEqual(["create 2023-04-02", "image 1"]);
    expect(outcome).toMatchObject({
      kind: "finished",
      progress: {
        finished: 2,
        created: 1,
        failures: [
          {
            key: `shop:${SHOP_A}|2023-04-01`,
            message:
              "サーバーで問題が発生しました。時間をおいてもう一度お試しください。",
            unconfirmed: false,
          },
        ],
      },
    });
  });

  it("names the photo that failed, so the admin can exclude it", async () => {
    fakeMealRecordServer();
    server.use(
      http.post(
        IMAGES,
        () => HttpResponse.json({ type: "internal_error" }, { status: 500 }),
        { once: true },
      ),
    );
    const failing = {
      ...entry(SHOP_A, "2023-04-01", 0),
      photos: [
        photo(new File(["jpeg"], "IMG_0001.JPG", { type: "image/jpeg" })),
      ],
    };

    const outcome = await run(plan(failing));

    expect(outcome.progress.failures).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/^IMG_0001\.JPG: /),
      }),
    ]);
  });

  it("ends stopped once aborted, leaving the rest unsent", async () => {
    const fake = fakeMealRecordServer();
    const controller = new AbortController();

    const outcome = await runImport(
      plan(entry(SHOP_A, "2023-04-01", 2), entry(SHOP_B, "2023-04-02", 1)),
      {
        signal: controller.signal,
        onProgress: (progress: RunProgress) => {
          if (progress.uploadedImages === 1) {
            controller.abort();
          }
        },
      },
    );

    expect(outcome.kind).toBe("stopped");
    expect(fake.log).toEqual(["create 2023-04-01", "image 1"]);
  });

  describe("on a browser that decodes the photos", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("sends each photo shrunk to 2048 px on its long edge", async () => {
      fakeMealRecordServer();
      vi.stubGlobal("createImageBitmap", async () => ({
        width: 4032,
        height: 3024,
        close: () => {},
      }));
      const drawn: number[][] = [];
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillRect: () => {},
        drawImage: (_: unknown, _x: number, _y: number, w: number, h: number) =>
          drawn.push([w, h]),
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (callback) => callback(new Blob(["small"], { type: "image/jpeg" })),
      );
      // The frame header of a 4032 x 3024 JPEG.
      const header = new Uint8Array([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b, 0xd0, 0x0f, 0xc0, 0x03,
      ]);
      const phone = new File([header], "IMG_0001.JPG", { type: "image/jpeg" });

      await run(
        plan({ ...entry(SHOP_A, "2023-04-01", 0), photos: [photo(phone)] }),
      );

      expect(drawn).toEqual([[2048, 1536]]);
    });
  });

  describe("a venue without a shop", () => {
    const FESTIVAL = "日本ご当地ラーメン総選挙";
    const venueEntry = (day: string, photoCount: number): PlanEntry => ({
      ...entry(SHOP_A, day, photoCount),
      key: mealRecordKey(
        { kind: "venue", venueName: FESTIVAL },
        day as IsoDate,
      ),
      target: { kind: "venue", venueName: FESTIVAL },
    });

    it("creates a meal record with no shop at the venue, then uploads its photos in order", async () => {
      const fake = fakeMealRecordServer();
      const posted: unknown[] = [];
      // Returns nothing, so the fake still answers.
      server.use(
        http.post("/api/v1/auth/meal-records", async ({ request }) => {
          posted.push(await request.clone().json());
        }),
      );

      const outcome = await run(plan(venueEntry("2023-05-20", 2)));

      expect(posted).toEqual([
        { shopIds: [], venueName: FESTIVAL, eatenOn: "2023-05-20" },
      ]);
      expect(fake.log).toEqual(["create 2023-05-20", "image 1", "image 2"]);
      expect(fake.mealRecordsOf(`venue:${FESTIVAL}`)).toMatchObject([
        { shops: [], venue: { name: FESTIVAL }, eatenOn: "2023-05-20" },
      ]);
      expect(outcome.progress).toMatchObject({ created: 1, uploadedImages: 2 });
    });

    it("creates and uploads nothing more when the same plan runs again", async () => {
      const fake = fakeMealRecordServer();
      const p = plan(venueEntry("2023-05-20", 2));
      await run(p);
      const writes = [...fake.log];

      const again = await run(p);

      expect(fake.log).toEqual(writes);
      expect(again.progress).toMatchObject({ alreadyDone: 1, created: 0 });
    });

    it("uploads only the missing photos to the venue's meal record of that day, not to a shop's there", async () => {
      const venue = {
        id: "00000000-0000-4000-8000-0000000000ff",
        name: FESTIVAL,
      };
      const fake = fakeMealRecordServer({
        [SHOP_A]: [{ ...mealRecordWithImages("2023-05-20", 3), venue }],
        [`venue:${FESTIVAL}`]: [
          { ...mealRecordWithImages("2023-05-20", 1), shops: [], venue },
        ],
      });

      const outcome = await run(plan(venueEntry("2023-05-20", 2)));

      expect(fake.log).toEqual(["image 2"]);
      expect(outcome.progress).toMatchObject({ resumed: 1, uploadedImages: 1 });
    });
  });
});
