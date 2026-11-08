import type { Proposal } from "@/features/shop-enrichment/proposal-file.ts";
import {
  canBulkApprove,
  currentValueOf,
  editProblem,
  shopUpdateOf,
  stateOf,
} from "@/features/shop-enrichment/review.ts";
import type { BusinessHours } from "@/features/shops/business-hours.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { describe, expect, it } from "vitest";

const base = {
  id: "key",
  shopId: "shop",
  evidence: [],
  estimated: false,
  reviewReasons: [],
} as const;

const name = (baseValue: string, proposedValue: string): Proposal => ({
  ...base,
  field: "name",
  baseValue,
  proposedValue,
});
const openedAt = (
  baseValue: string | null,
  proposedValue: string,
): Proposal => ({ ...base, field: "opened_at", baseValue, proposedValue });
const link = (type: "official" | "tabelog" | "reservation", url: string) =>
  ({
    ...base,
    field: "link",
    baseValue: null,
    proposedValue: { type, url, label: null },
  }) satisfies Proposal;
const tagProposal = (slug: string) =>
  ({
    ...base,
    field: "tag",
    baseValue: null,
    proposedValue: slug,
  }) satisfies Proposal;

describe("stateOf", () => {
  const shop = makeShop({
    name: "本番の店名",
    links: [{ type: "tabelog", url: "https://tabelog.com/x/" }],
    tags: [makeTag({ slug: "shoyu" })],
  });
  const tags = [makeTag({ slug: "shoyu" }), makeTag({ slug: "miso" })];
  const kind = (proposal: Proposal, target = shop) =>
    stateOf(proposal, target, tags).kind;

  it("is ready while production still holds what the research saw", () => {
    expect(kind(name("本番の店名", "新しい店名"))).toBe("ready");
    expect(kind(openedAt(null, "2020-01-01"))).toBe("ready");
  });

  it("is applied once production holds the proposed value", () => {
    expect(kind(name("古い店名", "本番の店名"))).toBe("applied");
    expect(kind(link("tabelog", "https://tabelog.com/x/"))).toBe("applied");
    expect(kind(tagProposal("shoyu"))).toBe("applied");
  });

  it("is a conflict when production moved away from what the research saw", () => {
    expect(kind(name("古い店名", "新しい店名"))).toBe("conflict");
    expect(
      kind(openedAt(null, "2020-01-01"), makeShop({ openedAt: "2019-01-01" })),
    ).toBe("conflict");
  });

  it("compares a 臨時休業 by its dates", () => {
    const closure = (baseStartsOn: string | null): Proposal => ({
      ...base,
      field: "temporary_closure",
      baseValue: baseStartsOn
        ? { startsOn: baseStartsOn, reopensOn: null }
        : null,
      proposedValue: { startsOn: "2026-11-10", reopensOn: "2026-11-20" },
    });
    const closed = makeShop({
      temporaryClosure: { startsOn: "2026-11-01" },
    });
    expect(kind(closure("2026-11-01"), closed)).toBe("ready");
    expect(kind(closure(null), closed)).toBe("conflict");
    expect(
      kind(
        closure(null),
        makeShop({
          temporaryClosure: { startsOn: "2026-11-10", reopensOn: "2026-11-20" },
        }),
      ),
    ).toBe("applied");
  });

  it("compares 営業時間 by their week and confirms an unchanged week with a newer 確認日", () => {
    const week = (opensAt: string): BusinessHours => ({
      kind: "weekly",
      days: (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(
        (day) => ({ day, periods: [{ opensAt, closesAt: "15:00" }] }),
      ),
    });
    const hours = (
      baseValue: BusinessHours | null,
      checkedOn = "2026-11-05",
    ): Proposal => ({
      ...base,
      field: "business_hours",
      baseValue,
      proposedValue: { ...week("11:00"), checkedOn },
    });
    const stored = makeShop({
      businessHours: { ...week("11:00"), checkedOn: "2026-10-01" },
    });
    expect(kind(hours(null), stored)).toBe("ready");
    expect(kind(hours(null, "2026-10-01"), stored)).toBe("applied");
    const older = makeShop({ businessHours: week("10:00") });
    expect(kind(hours(week("10:00")), older)).toBe("ready");
    expect(kind(hours(null), older)).toBe("conflict");
    expect(kind(hours(null), makeShop())).toBe("ready");
  });

  it("is unavailable for a shop or tag production no longer has", () => {
    expect(stateOf(name("a", "b"), undefined, tags)).toEqual({
      kind: "unavailable",
      reason: "shop_missing",
    });
    expect(stateOf(tagProposal("gone"), shop, tags)).toEqual({
      kind: "unavailable",
      reason: "tag_missing",
    });
  });

  it("leaves a second link of a type to a person", () => {
    const second = link("tabelog", "https://tabelog.com/y/");
    expect(kind(second)).toBe("conflict");
    expect(currentValueOf(second, shop)).toBe("https://tabelog.com/x/");
    expect(kind(link("official", "https://example.com/"))).toBe("ready");
    expect(currentValueOf(link("official", "https://example.com/"), shop)).toBe(
      null,
    );
  });
});

describe("canBulkApprove", () => {
  it("needs a ready proposal with no review reason", () => {
    const proposal = openedAt(null, "2020-01-01");
    expect(canBulkApprove(proposal, { kind: "ready" })).toBe(true);
    expect(canBulkApprove(proposal, { kind: "conflict" })).toBe(false);
    expect(
      canBulkApprove(
        { ...proposal, reviewReasons: ["replaces_existing_value"] },
        { kind: "ready" },
      ),
    ).toBe(false);
  });
});

describe("editProblem", () => {
  it("accepts the values the server can store", () => {
    expect(editProblem(openedAt(null, "2020-01-01"))).toBeNull();
    expect(editProblem(name("a", "b"))).toBeNull();
    expect(editProblem(link("official", "https://example.com/"))).toBeNull();
  });

  it("refuses an empty or malformed value", () => {
    // The server would store an unparsable date as no date at all.
    expect(editProblem(openedAt(null, ""))).not.toBeNull();
    expect(editProblem(name("a", "  "))).not.toBeNull();
    expect(editProblem(link("official", "javascript:alert(1)"))).not.toBeNull();
    expect(
      editProblem({
        ...base,
        field: "temporary_closure",
        baseValue: null,
        proposedValue: { startsOn: "2026-11-10", reopensOn: "2026-11-10" },
      }),
    ).not.toBeNull();
  });
});

describe("shopUpdateOf", () => {
  const shoyu = makeTag({ slug: "shoyu" });
  const miso = makeTag({ slug: "miso" });
  const shop = makeShop({
    name: "店",
    nameKana: "みせ",
    openedAt: "2020-01-01",
    closedAt: "2026-01-01",
    wishLevel: "high",
    googlePlaceId: "place",
    temporaryClosure: { startsOn: "2026-11-01" },
    tags: [shoyu],
    links: [
      { type: "official", url: "https://example.com/" },
      { type: "reservation", url: "https://reserve.example.com/" },
    ],
  });

  it("keeps everything it was not asked to change", () => {
    expect(shopUpdateOf(shop, [shoyu, miso], [])).toEqual({
      name: "店",
      lat: shop.lat,
      lng: shop.lng,
      postalCode: shop.postalCode,
      address: shop.address,
      // updateShop clears these two when they are missing.
      openedAt: "2020-01-01",
      closedAt: "2026-01-01",
      category: "ramen",
      tagIds: [shoyu.id],
    });
  });

  it("changes each proposed field", () => {
    const command = shopUpdateOf(
      shop,
      [shoyu, miso],
      [
        name("店", "新しい店"),
        { ...base, field: "name_kana", baseValue: "みせ", proposedValue: "あ" },
        openedAt("2020-01-01", "2019-05-05"),
        {
          ...base,
          field: "temporary_closure",
          baseValue: null,
          proposedValue: { startsOn: "2026-12-01", reopensOn: null },
        },
        {
          ...base,
          field: "business_hours",
          baseValue: null,
          proposedValue: {
            kind: "irregular",
            days: [],
            checkedOn: "2026-11-05",
          },
        },
        tagProposal("miso"),
      ],
    );
    expect(command).toMatchObject({
      name: "新しい店",
      nameKana: "あ",
      openedAt: "2019-05-05",
      closedAt: "2026-01-01",
      temporaryClosure: { startsOn: "2026-12-01", reopensOn: undefined },
      businessHours: { kind: "irregular", days: [], checkedOn: "2026-11-05" },
      tagIds: [shoyu.id, miso.id],
    });
  });

  it("trims an edited value, because the server stores a name as sent", () => {
    const command = shopUpdateOf(shop, [], [name("店", " 新しい店  ")]);
    expect(command.name).toBe("新しい店");
  });

  it("places a new link by type and leaves existing links in their order", () => {
    const command = shopUpdateOf(
      shop,
      [],
      [link("tabelog", "https://tabelog.com/x/")],
    );
    expect(command.links?.map((l) => l.type)).toEqual([
      "official",
      "tabelog",
      "reservation",
    ]);
  });

  it("adds one link once, however it arrived", () => {
    const again = link("official", "https://example.com/");
    expect(shopUpdateOf(shop, [], [again]).links?.map((l) => l.url)).toEqual([
      "https://example.com/",
      "https://reserve.example.com/",
    ]);
    const pasted = link("tabelog", " https://tabelog.com/x/ ");
    expect(
      shopUpdateOf(shop, [], [pasted, pasted]).links?.map((l) => l.url),
    ).toEqual([
      "https://example.com/",
      "https://tabelog.com/x/",
      "https://reserve.example.com/",
    ]);
  });

  it("sends no links when none changed, so the server keeps them", () => {
    expect(shopUpdateOf(shop, [shoyu], [])).not.toHaveProperty("links");
  });
});
