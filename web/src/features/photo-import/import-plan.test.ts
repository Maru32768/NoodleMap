import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import type { IsoDate } from "@/features/meal-records/eaten-date.ts";
import type { PhotoGroup } from "@/features/photo-import/grouping.ts";
import {
  buildPlan,
  decideAction,
  defaultChoice,
  mealRecordKey,
  PlanEntry,
  ShopChoice,
  targetKey,
} from "@/features/photo-import/import-plan.ts";
import { matchShop } from "@/features/photo-import/matching.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import { makeShop } from "@/test/fixtures.ts";
import { describe, expect, it } from "vitest";

const SHOP_A = makeShop({ name: "A", lat: 35.6895, lng: 139.7005 });
// About 11 m north of A, so a group at A is always ambiguous between them.
const SHOP_B = makeShop({ name: "B", lat: 35.6896, lng: 139.7005 });

const atShop = (shopId: string) => ({ kind: "shop", shopId }) as const;

let nextIndex = 0;
function group(on: string, photoCount = 1, minute = 0): PhotoGroup {
  const photos: Photo[] = Array.from({ length: photoCount }, (_, i) => ({
    index: nextIndex++,
    file: new File([], "p.jpg"),
    dateSource: "exif",
    capturedAt: new Date(
      `${on}T12:${String(minute + i).padStart(2, "0")}:00+09:00`,
    ),
    location: SHOP_A,
  }));
  return { id: photos[0].index, day: on as IsoDate, photos, center: SHOP_A };
}

let nextMealRecord = 0;
function mealRecord(
  eatenOn: string | undefined,
  images = 0,
  extra: Partial<MealRecord> = {},
): MealRecord {
  return {
    id: `mealRecord-${nextMealRecord++}`,
    eatenOn,
    shops: [SHOP_A],
    menuItems: [],
    images: Array.from({ length: images }, (_, i) => ({
      id: `image-${i}`,
      url: `https://example.com/${i}.jpg`,
      width: 1,
      height: 1,
    })),
    ...extra,
  };
}

const pick = (
  shopId: string,
  source: "auto" | "admin" = "auto",
): ShopChoice => ({ kind: "shop", shopId, source });

function entry({
  photoCount = 3,
  claimsDateless = true,
}: { photoCount?: number; claimsDateless?: boolean } = {}): PlanEntry {
  const g = group("2023-04-01", photoCount);
  return {
    key: mealRecordKey(atShop(SHOP_A.id), g.day),
    target: atShop(SHOP_A.id),
    day: g.day,
    photos: g.photos,
    overflow: 0,
    claimsDateless,
    details: undefined,
  };
}

describe("defaultChoice", () => {
  it("requires a manual shop choice for filename dates", () => {
    const g = group("2019-08-03");
    const filenameGroup = {
      ...g,
      center: null,
      photos: g.photos.map(
        (p): Photo => ({ ...p, dateSource: "filename", location: null }),
      ),
    };
    expect(
      defaultChoice(filenameGroup, { kind: "no_location" }, new Map()),
    ).toEqual({ kind: "undecided" });
  });

  it("picks the auto match, asks on an ambiguous one and skips far or unlocated photos", () => {
    const g = group("2023-04-01");
    const none = new Map();

    expect(defaultChoice(g, matchShop(SHOP_A, [SHOP_A]), none)).toEqual(
      pick(SHOP_A.id),
    );
    expect(defaultChoice(g, matchShop(SHOP_A, [SHOP_A, SHOP_B]), none)).toEqual(
      { kind: "undecided" },
    );
    expect(defaultChoice(g, { kind: "far" }, none)).toEqual({ kind: "skip" });
    expect(defaultChoice(g, { kind: "no_location" }, none)).toEqual({
      kind: "skip",
    });
  });

  it("prefers the one candidate that already has a meal record on that day, even over an auto pick", () => {
    const g = group("2023-04-01");
    // About 44 m north of A: far enough for A to auto-pick.
    const nearB = makeShop({ name: "B", lat: 35.6899, lng: 139.7005 });
    const autoA = matchShop(SHOP_A, [SHOP_A, nearB]);
    expect(autoA.kind).toBe("auto");

    const choice = defaultChoice(
      g,
      autoA,
      new Map([[targetKey(atShop(nearB.id)), [mealRecord("2023-04-01")]]]),
    );

    expect(choice).toEqual({
      kind: "shop",
      shopId: nearB.id,
      source: "existing",
    });
  });

  it("asks when two candidates have a meal record on that day", () => {
    const g = group("2023-04-01");
    const mealRecords = new Map([
      [targetKey(atShop(SHOP_A.id)), [mealRecord("2023-04-01")]],
      [targetKey(atShop(SHOP_B.id)), [mealRecord("2023-04-01")]],
    ]);

    expect(
      defaultChoice(g, matchShop(SHOP_A, [SHOP_A, SHOP_B]), mealRecords),
    ).toEqual({ kind: "undecided" });
  });
});

describe("buildPlan", () => {
  it("merges groups of one shop on one day into one entry, capped at 10 with the rest as overflow", () => {
    const morning = group("2023-04-01", 6, 0);
    const noon = group("2023-04-01", 6, 30);

    const { entries } = buildPlan(
      [noon, morning],
      () => pick(SHOP_A.id),
      new Set(),
      new Map(),
      new Map(),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe(`shop:${SHOP_A.id}|2023-04-01`);
    expect(entries[0].photos.map((p) => p.index)).toEqual(
      [...morning.photos, ...noon.photos].slice(0, 10).map((p) => p.index),
    );
    expect(entries[0].overflow).toBe(2);
  });

  it("leaves out excluded photos, skipped and undecided groups", () => {
    const kept = group("2023-04-01", 2);
    const allExcluded = group("2023-04-02", 1);
    const skipped = group("2023-04-03");
    const undecided = group("2023-04-04");
    const choices = new Map<number, ShopChoice>([
      [skipped.id, { kind: "skip" }],
      [undecided.id, { kind: "undecided" }],
    ]);

    const { entries } = buildPlan(
      [kept, allExcluded, skipped, undecided],
      (g) => choices.get(g.id) ?? pick(SHOP_A.id),
      new Set([kept.photos[1].index, allExcluded.photos[0].index]),
      new Map(),
      new Map(),
    );

    expect(entries.map((e) => [e.day, e.photos.map((p) => p.index)])).toEqual([
      ["2023-04-01", [kept.photos[0].index]],
    ]);
  });

  it("uploads an entry's photos in the admin's order, capture order for the rest, then caps", () => {
    const g = group("2023-04-01", 12);
    const [first, second, third] = g.photos.map((p) => p.index);
    const last = g.photos[11].index;

    const { entries } = buildPlan(
      [g],
      () => pick(SHOP_A.id),
      new Set(),
      new Map(),
      new Map([[mealRecordKey(atShop(SHOP_A.id), g.day), [last, third]]]),
    );

    expect(entries[0].photos.slice(0, 4).map((p) => p.index)).toEqual([
      last,
      third,
      first,
      second,
    ]);
    expect(entries[0].photos.map((p) => p.index)).not.toContain(
      g.photos[10].index,
    );
    expect(entries[0].overflow).toBe(2);
  });

  it("gives each entry the details written for its meal record", () => {
    const april = group("2023-04-01");
    const may = group("2023-05-01");
    const details = { shopIds: [SHOP_A.id], rate: 80 };

    const { entries } = buildPlan(
      [april, may],
      () => pick(SHOP_A.id),
      new Set(),
      new Map([
        [mealRecordKey(atShop(SHOP_A.id), "2023-04-01" as IsoDate), details],
      ]),
      new Map(),
    );

    expect(entries.map((e) => [e.day, e.details])).toEqual([
      ["2023-04-01", details],
      ["2023-05-01", undefined],
    ]);
  });

  it("lets only each shop's earliest day claim its dateless meal record", () => {
    const may = group("2023-05-01");
    const april = group("2023-04-01");
    const atB = group("2023-04-15");
    const shopOf = new Map([
      [may.id, SHOP_A.id],
      [april.id, SHOP_A.id],
      [atB.id, SHOP_B.id],
    ]);

    const { entries } = buildPlan(
      [may, april, atB],
      (g) => pick(shopOf.get(g.id)!),
      new Set(),
      new Map(),
      new Map(),
    );

    expect(entries.map((e) => [e.key, e.claimsDateless])).toEqual([
      [`shop:${SHOP_A.id}|2023-04-01`, true],
      [`shop:${SHOP_B.id}|2023-04-15`, true],
      [`shop:${SHOP_A.id}|2023-05-01`, false],
    ]);
  });

  it("runs entries with an admin-decided group first, each tier by day", () => {
    const early = group("2023-04-01");
    const late = group("2023-06-01");
    const middle = group("2023-05-01");

    const { entries } = buildPlan(
      [early, late, middle],
      (g) => pick(SHOP_A.id, g === late ? "admin" : "auto"),
      new Set(),
      new Map(),
      new Map(),
    );

    expect(entries.map((e) => e.day)).toEqual([
      "2023-06-01",
      "2023-04-01",
      "2023-05-01",
    ]);
  });
});

describe("decideAction", () => {
  it("does not count collaboration images as this shop's import cursor or claim a shared undated record", () => {
    const shops = [SHOP_A, SHOP_B];
    expect(
      decideAction(entry(), [
        mealRecord("2023-04-01", 3, { shops }),
        mealRecord(undefined, 0, { shops }),
      ]),
    ).toEqual({ kind: "create" });
    const single = mealRecord("2023-04-01", 1);
    expect(
      decideAction(entry(), [mealRecord("2023-04-01", 3, { shops }), single]),
    ).toEqual({ kind: "resume", mealRecordId: single.id, uploaded: 1 });
  });
  it("creates a meal record when the shop has none on that day and nothing to claim", () => {
    expect(decideAction(entry(), [mealRecord("2023-03-01", 2)])).toEqual({
      kind: "create",
    });
  });

  it("claims a dateless meal record without images, handing it over whole", () => {
    const dateless = mealRecord(undefined, 0, {
      rate: 70,
      publicNote: "old app",
    });

    expect(decideAction(entry(), [mealRecord("2023-03-01"), dateless])).toEqual(
      {
        kind: "claim",
        mealRecord: dateless,
      },
    );
  });

  it("leaves a dateless meal record alone when it has images or a later day would claim it", () => {
    expect(decideAction(entry(), [mealRecord(undefined, 1)])).toEqual({
      kind: "create",
    });
    expect(
      decideAction(entry({ claimsDateless: false }), [mealRecord(undefined)]),
    ).toEqual({ kind: "create" });
  });

  it("resumes the same-day meal record from its image count and is done once it has them all", () => {
    const partial = mealRecord("2023-04-01", 2);
    const complete = mealRecord("2023-04-01", 3);

    expect(
      decideAction(entry({ photoCount: 3 }), [partial, mealRecord(undefined)]),
    ).toEqual({ kind: "resume", mealRecordId: partial.id, uploaded: 2 });
    expect(decideAction(entry({ photoCount: 3 }), [partial, complete])).toEqual(
      { kind: "done", mealRecordId: complete.id },
    );
  });
});

describe("a venue without a shop", () => {
  const FESTIVAL = "日本ご当地ラーメン総選挙";
  const atVenue = (venueName: string): ShopChoice => ({
    kind: "venue",
    venueName,
  });
  const festivalRecord = (eatenOn: string | undefined, images = 0) =>
    mealRecord(eatenOn, images, {
      shops: [],
      venue: { id: "venue-1", name: FESTIVAL },
    });

  it("merges the venue's groups of one day into one entry and keeps other days apart", () => {
    const booth1 = group("2023-05-20", 2, 0);
    const booth2 = group("2023-05-20", 1, 40);
    const nextDay = group("2023-05-21");

    const { entries } = buildPlan(
      [booth2, nextDay, booth1],
      () => atVenue(FESTIVAL),
      new Set(),
      new Map(),
      new Map(),
    );

    expect(
      entries.map((e) => [e.target, e.day, e.photos.length, e.claimsDateless]),
    ).toEqual([
      [{ kind: "venue", venueName: FESTIVAL }, "2023-05-20", 3, true],
      [{ kind: "venue", venueName: FESTIVAL }, "2023-05-21", 1, false],
    ]);
  });

  it("keeps a venue's meal record apart from a shop's on the same day", () => {
    const booth = group("2023-05-20");
    const shop = group("2023-05-20", 1, 30);

    const { entries } = buildPlan(
      [booth, shop],
      (g) => (g === booth ? atVenue(FESTIVAL) : pick(SHOP_A.id)),
      new Set(),
      new Map(),
      new Map(),
    );

    expect(entries.map((e) => e.key).sort()).toEqual([
      `shop:${SHOP_A.id}|2023-05-20`,
      `venue:${FESTIVAL}|2023-05-20`,
    ]);
  });

  it("finds only the venue's shop-less meal record of that day and resumes from its image count", () => {
    const [entry] = buildPlan(
      [group("2023-05-20", 3)],
      () => atVenue(FESTIVAL),
      new Set(),
      new Map(),
      new Map(),
    ).entries;
    const shopAtVenue = mealRecord("2023-05-20", 5, {
      venue: { id: "venue-1", name: FESTIVAL },
    });
    const own = festivalRecord("2023-05-20", 1);

    expect(decideAction(entry, [shopAtVenue])).toEqual({ kind: "create" });
    expect(decideAction(entry, [shopAtVenue, own])).toEqual({
      kind: "resume",
      mealRecordId: own.id,
      uploaded: 1,
    });
    expect(decideAction(entry, [festivalRecord("2023-05-20", 3)])).toEqual({
      kind: "done",
      mealRecordId: expect.any(String),
    });
  });
});
