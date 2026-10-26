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
} from "@/features/photo-import/import-plan.ts";
import { matchShop } from "@/features/photo-import/matching.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import { makeShop } from "@/test/fixtures.ts";
import { describe, expect, it } from "vitest";

const SHOP_A = makeShop({ name: "A", lat: 35.6895, lng: 139.7005 });
// About 11 m north of A, so a group at A is always ambiguous between them.
const SHOP_B = makeShop({ name: "B", lat: 35.6896, lng: 139.7005 });

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
    key: mealRecordKey(SHOP_A.id, g.day),
    shopId: SHOP_A.id,
    day: g.day,
    photos: g.photos,
    overflow: 0,
    claimsDateless,
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
      new Map([[nearB.id, [mealRecord("2023-04-01")]]]),
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
      [SHOP_A.id, [mealRecord("2023-04-01")]],
      [SHOP_B.id, [mealRecord("2023-04-01")]],
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
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe(`${SHOP_A.id}|2023-04-01`);
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
    );

    expect(entries.map((e) => [e.day, e.photos.map((p) => p.index)])).toEqual([
      ["2023-04-01", [kept.photos[0].index]],
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
    );

    expect(entries.map((e) => [e.key, e.claimsDateless])).toEqual([
      [`${SHOP_A.id}|2023-04-01`, true],
      [`${SHOP_B.id}|2023-04-15`, true],
      [`${SHOP_A.id}|2023-05-01`, false],
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
