import type { PhotoGroup } from "@/features/photo-import/grouping.ts";
import {
  buildPlan,
  decideAction,
  defaultChoice,
  PlanEntry,
  ShopChoice,
  visitKey,
} from "@/features/photo-import/import-plan.ts";
import { matchShop } from "@/features/photo-import/matching.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import type { VisitLog } from "@/features/visits/api/use-visits.ts";
import type { IsoDate } from "@/features/visits/visit-date.ts";
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

let nextVisit = 0;
function visit(
  visitedOn: string | undefined,
  images = 0,
  extra: Partial<VisitLog> = {},
): VisitLog {
  return {
    id: `visit-${nextVisit++}`,
    visitedOn,
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
    key: visitKey(SHOP_A.id, g.day),
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

  it("prefers the one candidate that already has a visit on that day, even over an auto pick", () => {
    const g = group("2023-04-01");
    // About 44 m north of A: far enough for A to auto-pick.
    const nearB = makeShop({ name: "B", lat: 35.6899, lng: 139.7005 });
    const autoA = matchShop(SHOP_A, [SHOP_A, nearB]);
    expect(autoA.kind).toBe("auto");

    const choice = defaultChoice(
      g,
      autoA,
      new Map([[nearB.id, [visit("2023-04-01")]]]),
    );

    expect(choice).toEqual({
      kind: "shop",
      shopId: nearB.id,
      source: "existing",
    });
  });

  it("asks when two candidates have a visit on that day", () => {
    const g = group("2023-04-01");
    const visits = new Map([
      [SHOP_A.id, [visit("2023-04-01")]],
      [SHOP_B.id, [visit("2023-04-01")]],
    ]);

    expect(
      defaultChoice(g, matchShop(SHOP_A, [SHOP_A, SHOP_B]), visits),
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

  it("lets only each shop's earliest day claim its dateless visit", () => {
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
  it("creates a visit when the shop has none on that day and nothing to claim", () => {
    expect(decideAction(entry(), [visit("2023-03-01", 2)])).toEqual({
      kind: "create",
    });
  });

  it("claims a dateless visit without images, handing it over whole", () => {
    const dateless = visit(undefined, 0, { rate: 70, publicNote: "old app" });

    expect(decideAction(entry(), [visit("2023-03-01"), dateless])).toEqual({
      kind: "claim",
      visit: dateless,
    });
  });

  it("leaves a dateless visit alone when it has images or a later day would claim it", () => {
    expect(decideAction(entry(), [visit(undefined, 1)])).toEqual({
      kind: "create",
    });
    expect(
      decideAction(entry({ claimsDateless: false }), [visit(undefined)]),
    ).toEqual({ kind: "create" });
  });

  it("resumes the same-day visit from its image count and is done once it has them all", () => {
    const partial = visit("2023-04-01", 2);
    const complete = visit("2023-04-01", 3);

    expect(
      decideAction(entry({ photoCount: 3 }), [partial, visit(undefined)]),
    ).toEqual({ kind: "resume", visitId: partial.id, uploaded: 2 });
    expect(decideAction(entry({ photoCount: 3 }), [partial, complete])).toEqual(
      { kind: "done", visitId: complete.id },
    );
  });
});
