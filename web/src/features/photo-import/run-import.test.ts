import {
  ImportPlan,
  PlanEntry,
  visitKey,
} from "@/features/photo-import/import-plan.ts";
import type { RunProgress } from "@/features/photo-import/import-state.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import { runImport } from "@/features/photo-import/run-import.ts";
import type { VisitLog } from "@/features/visits/api/use-visits.ts";
import type { IsoDate } from "@/features/visits/visit-date.ts";
import { server } from "@/test/server.ts";
import { fakeVisitServer } from "@/test/visit-server.ts";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

const SHOP_A = "00000000-0000-4000-8000-00000000000a";
const SHOP_B = "00000000-0000-4000-8000-00000000000b";
const IMAGES = "/api/v1/auth/visits/:visitId/images";

let nextIndex = 0;
const photo = (
  file = new File(["jpeg"], "photo.jpg", { type: "image/jpeg" }),
): Photo => ({
  index: nextIndex++,
  file,
  capturedAt: new Date(),
  location: null,
});

function entry(shopId: string, day: string, photoCount: number): PlanEntry {
  return {
    key: visitKey(shopId, day as IsoDate),
    shopId,
    day: day as IsoDate,
    photos: Array.from({ length: photoCount }, () => photo()),
    overflow: 0,
    claimsDateless: true,
  };
}

const plan = (...entries: PlanEntry[]): ImportPlan => ({ entries });

const run = (p: ImportPlan) =>
  runImport(p, { signal: new AbortController().signal, onProgress: () => {} });

function visitWithImages(visitedOn: string | undefined, count = 0): VisitLog {
  return {
    id: crypto.randomUUID(),
    visitedOn,
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
  it("creates each visit dated on its day and uploads its photos in order", async () => {
    const fake = fakeVisitServer();

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
    const fake = fakeVisitServer();
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

  it("uploads only the missing photos of a visit that has 2 of its 4", async () => {
    const fake = fakeVisitServer({
      [SHOP_A]: [visitWithImages("2023-04-01", 2)],
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

  it("dates a dateless visit with a PUT that carries every one of its fields", async () => {
    const dateless: VisitLog = {
      ...visitWithImages(undefined),
      menuItems: [{ name: "中華そば", isLimited: true, price: 900 }],
      rate: 70,
      eventName: "催事",
      publicNote: "旧アプリ",
      privateNote: "非公開",
    };
    const fake = fakeVisitServer({ [SHOP_A]: [dateless] });

    const outcome = await run(plan(entry(SHOP_A, "2023-04-01", 1)));

    expect(fake.log).toEqual([
      `update ${JSON.stringify({
        visitedOn: "2023-04-01",
        menuItems: [{ name: "中華そば", isLimited: true, price: 900 }],
        rate: 70,
        eventName: "催事",
        publicNote: "旧アプリ",
        privateNote: "非公開",
      })}`,
      "image 1",
    ]);
    expect(fake.visitsOf(SHOP_A)).toHaveLength(1);
    expect(outcome.progress).toMatchObject({ claimed: 1, created: 0 });
  });

  it("looks again after an upload cut off at status 0 and does not resend a photo the server saved", async () => {
    const fake = fakeVisitServer();
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
    const fake = fakeVisitServer();
    const busy = () =>
      HttpResponse.json(
        { type: "visit_image_processing_busy" },
        { status: 503, headers: { "Retry-After": "0" } },
      );
    // Each try is two requests (uploadVisitImage retries once itself): the third try gets through.
    for (let i = 0; i < 4; i++) {
      server.use(http.post(IMAGES, busy, { once: true }));
    }

    const outcome = await run(plan(entry(SHOP_A, "2023-04-01", 1)));

    expect(fake.log).toEqual(["create 2023-04-01", "image 1"]);
    expect(outcome.progress.failures).toEqual([]);
  });

  it("ends unauthorized when the session is gone, without trying the next entry", async () => {
    const fake = fakeVisitServer();
    let posts = 0;
    server.use(
      http.post("/api/v1/auth/shops/:id/visits", () => {
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
    const fake = fakeVisitServer();
    server.use(
      http.post(
        "/api/v1/auth/shops/:id/visits",
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
            key: `${SHOP_A}|2023-04-01`,
            message:
              "サーバーで問題が発生しました。時間をおいてもう一度お試しください。",
            unconfirmed: false,
          },
        ],
      },
    });
  });

  it("ends stopped once aborted, leaving the rest unsent", async () => {
    const fake = fakeVisitServer();
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
      fakeVisitServer();
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
});
