import {
  createQueryMatcher,
  favToHearts,
  filterShops,
  normalizeForSearch,
  SearchFilters,
  sortShops,
} from "@/features/search/utils.ts";
import { SYSTEM_TAGS } from "@/features/shops/status.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

const ALL_SYSTEM_TAGS = SYSTEM_TAGS.map((tag) => tag.slug);

const showEverything: SearchFilters = {
  eaten: true,
  wish: true,
  ramen: true,
  udon: true,
  favMin: 0,
  wishMin: "all",
  tagIds: ALL_SYSTEM_TAGS,
};

function names(shops: { name: string }[]) {
  return shops.map((shop) => shop.name);
}

function filterNames(
  shops: ReturnType<typeof makeShop>[],
  filters: Partial<SearchFilters>,
  query = "",
) {
  return names(
    filterShops(shops, { query, filters: { ...showEverything, ...filters } }),
  );
}

describe("favToHearts", () => {
  it.each([
    [undefined, 0],
    [0, 0],
    [-10, 0],
    [10, 0.5],
    [50, 2.5],
    [100, 5],
    [140, 5],
  ])("maps rate %s to %s hearts", (rate, hearts) => {
    expect(favToHearts(rate)).toBe(hearts);
  });
});

describe("filterShops", () => {
  it("keeps every shop when every facet is selected", () => {
    const shops = [
      makeShop({ name: "A", eaten: true, category: "ramen" }),
      makeShop({ name: "B", eaten: false, category: "udon" }),
    ];

    expect(filterNames(shops, {})).toEqual(["A", "B"]);
  });

  it("ORs the visit toggles and hides a visit status that is off", () => {
    const shops = [
      makeShop({ name: "eaten", eaten: true }),
      makeShop({ name: "wish", eaten: false }),
    ];

    expect(filterNames(shops, { wish: false })).toEqual(["eaten"]);
    expect(filterNames(shops, { eaten: false })).toEqual(["wish"]);
    expect(filterNames(shops, { eaten: false, wish: false })).toEqual([]);
  });

  it("narrows only shops not eaten yet by 気になる度, unset counting as 気になる", () => {
    const shops = [
      makeShop({ name: "unset", eaten: false }),
      makeShop({ name: "low", eaten: false, wishLevel: "low" }),
      makeShop({ name: "medium", eaten: false, wishLevel: "medium" }),
      makeShop({ name: "high", eaten: false, wishLevel: "high" }),
      // A 食べた shop keeps its old 気になる度 but is never narrowed by it.
      makeShop({ name: "eaten", eaten: true, wishLevel: "low" }),
      makeShop({ name: "eaten-unset", eaten: true }),
    ];

    expect(filterNames(shops, { wishMin: "all" })).toEqual(names(shops));
    expect(filterNames(shops, { wishMin: "medium" })).toEqual([
      "unset",
      "medium",
      "high",
      "eaten",
      "eaten-unset",
    ]);
    expect(filterNames(shops, { wishMin: "high" })).toEqual([
      "high",
      "eaten",
      "eaten-unset",
    ]);
  });

  it("ORs the category toggles", () => {
    const shops = [
      makeShop({ name: "ramen", category: "ramen" }),
      makeShop({ name: "udon", category: "udon" }),
    ];

    expect(filterNames(shops, { udon: false })).toEqual(["ramen"]);
    expect(filterNames(shops, { ramen: false })).toEqual(["udon"]);
  });

  it("drops shops whose お気に入り度 is below favMin and ignores it at favMin 0", () => {
    const shops = [
      makeShop({ name: "60", rate: 60 }),
      makeShop({ name: "80", rate: 80 }),
      makeShop({ name: "0", rate: 0 }),
    ];

    expect(filterNames(shops, { favMin: 80 })).toEqual(["80"]);
    expect(filterNames(shops, { favMin: 0 })).toEqual(["60", "80", "0"]);
  });

  describe("system tag (status) facet", () => {
    const recentOpening = dayjs().subtract(30, "day").format("YYYY-MM-DD");
    const shops = [
      makeShop({ name: "open" }),
      makeShop({ name: "closed", closedAt: "2000-01-01" }),
      makeShop({ name: "upcoming", openedAt: "2999-01-01" }),
      makeShop({ name: "closingSoon", closedAt: "2999-12-31" }),
      makeShop({ name: "new", openedAt: recentOpening }),
    ];

    it("shows nothing when no status is selected", () => {
      expect(filterNames(shops, { tagIds: [] })).toEqual([]);
    });

    it("spotlights a single lifecycle state", () => {
      expect(filterNames(shops, { tagIds: ["system:closed"] })).toEqual([
        "closed",
      ]);
      expect(filterNames(shops, { tagIds: ["system:upcoming"] })).toEqual([
        "upcoming",
      ]);
    });

    it("matches a new shop through either its lifecycle or the new flag", () => {
      expect(filterNames(shops, { tagIds: ["system:new"] })).toEqual(["new"]);
      expect(filterNames(shops, { tagIds: ["system:open"] })).toEqual([
        "open",
        "new",
      ]);
    });
  });

  describe("user tag facet", () => {
    const spicy = makeTag({ label: "辛い" });
    const rich = makeTag({ label: "濃厚" });
    const shops = [
      makeShop({ name: "spicy", tags: [spicy] }),
      makeShop({ name: "rich", tags: [rich] }),
      makeShop({ name: "plain", tags: [] }),
    ];

    it("does not narrow when only system tags are selected", () => {
      expect(filterNames(shops, {})).toEqual(["spicy", "rich", "plain"]);
    });

    it("keeps shops having any selected user tag", () => {
      expect(
        filterNames(shops, { tagIds: [...ALL_SYSTEM_TAGS, spicy.id] }),
      ).toEqual(["spicy"]);
      expect(
        filterNames(shops, {
          tagIds: [...ALL_SYSTEM_TAGS, spicy.id, rich.id],
        }),
      ).toEqual(["spicy", "rich"]);
    });

    it("still requires a status match when a user tag is selected", () => {
      expect(filterNames(shops, { tagIds: [spicy.id] })).toEqual([]);
    });
  });

  it("matches the trimmed query case-insensitively against name and address", () => {
    const shops = [
      makeShop({ name: "Ramen Taro", address: "東京都渋谷区" }),
      makeShop({ name: "うどん花子", address: "香川県高松市" }),
    ];

    expect(filterNames(shops, {}, "  ramen ")).toEqual(["Ramen Taro"]);
    expect(filterNames(shops, {}, "高松")).toEqual(["うどん花子"]);
    expect(filterNames(shops, {}, "大阪")).toEqual([]);
  });

  it("matches the query against the reading and tag labels across kana forms", () => {
    const shops = [
      makeShop({ name: "麺屋 一燈", nameKana: "めんや いっとう" }),
      makeShop({ name: "Udon", tags: [makeTag({ label: "ラーメン" })] }),
    ];

    expect(filterNames(shops, {}, "いっとう")).toEqual(["麺屋 一燈"]);
    expect(filterNames(shops, {}, "イットウ")).toEqual(["麺屋 一燈"]);
    expect(filterNames(shops, {}, "らーめん")).toEqual(["Udon"]);
    expect(filterNames(shops, {}, "ﾗｰﾒﾝ")).toEqual(["Udon"]);
  });
});

describe("normalizeForSearch", () => {
  it.each([
    ["ラーメン", "らーめん"],
    ["ﾗｰﾒﾝ", "らーめん"],
    ["ガッツリ", "がっつり"],
    ["ヴ", "ゔ"],
    ["ＲＡＭＥＮ　１", "ramen 1"],
    ["漢字", "漢字"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });
});

describe("createQueryMatcher", () => {
  it("treats a blank query as matching everything", () => {
    expect(createQueryMatcher("  ")(makeShop())).toBe(true);
  });

  it("ignores a missing reading", () => {
    const shop = makeShop({ name: "Ramen", nameKana: undefined });

    expect(createQueryMatcher("ramen")(shop)).toBe(true);
    expect(createQueryMatcher("undefined")(shop)).toBe(false);
  });

  it("matches each whitespace-separated token against any field", () => {
    const shop = makeShop({ name: "中華そば 麺屋", address: "東京都新宿区" });

    expect(createQueryMatcher("中華そば　新宿")(shop)).toBe(true);
    expect(createQueryMatcher("新宿 中華そば")(shop)).toBe(true);
    expect(createQueryMatcher("中華そば 渋谷")(shop)).toBe(false);
  });

  it("does not let one token span two fields", () => {
    const shop = makeShop({ name: "麺屋", address: "東京都" });

    expect(createQueryMatcher("麺屋東京")(shop)).toBe(false);
  });
});

describe("sortShops", () => {
  const center = { lat: 35, lng: 139 };

  it("orders by distance when shops are more than 1 km apart", () => {
    const far = makeShop({ name: "far", lat: 35.1, lng: 139, rate: 100 });
    const near = makeShop({ name: "near", lat: 35.001, lng: 139, rate: 10 });

    expect(names(sortShops([far, near], center))).toEqual(["near", "far"]);
  });

  it("orders by お気に入り度 when shops are within 1 km of each other", () => {
    const low = makeShop({ name: "low", lat: 35.001, lng: 139, rate: 40 });
    const high = makeShop({ name: "high", lat: 35.004, lng: 139, rate: 90 });

    expect(names(sortShops([low, high], center))).toEqual(["high", "low"]);
  });

  it("does not mutate the input array", () => {
    const shops = [
      makeShop({ name: "far", lat: 36, lng: 139 }),
      makeShop({ name: "near", lat: 35, lng: 139 }),
    ];

    sortShops(shops, center);

    expect(names(shops)).toEqual(["far", "near"]);
  });
});
