import { matchesVisitFilter } from "@/features/admin/visit-filter.ts";
import { makeShop } from "@/test/fixtures.ts";
import { describe, expect, it } from "vitest";

const eatenOpen = makeShop({ eaten: true });
const wishOpen = makeShop({ eaten: false });
const eatenClosed = makeShop({ eaten: true, closedAt: "2020-01-01" });
const wishClosed = makeShop({ eaten: false, closedAt: "2020-01-01" });
const shops = [eatenOpen, wishOpen, eatenClosed, wishClosed];

describe("matchesVisitFilter", () => {
  it("shows every shop for すべて", () => {
    expect(shops.filter((s) => matchesVisitFilter(s, "all"))).toEqual(shops);
  });

  it("shows only open shops for 食べた and 行きたい", () => {
    expect(shops.filter((s) => matchesVisitFilter(s, "eaten"))).toEqual([
      eatenOpen,
    ]);
    expect(shops.filter((s) => matchesVisitFilter(s, "wish"))).toEqual([
      wishOpen,
    ]);
  });

  it("shows only closed shops for 閉店", () => {
    expect(shops.filter((s) => matchesVisitFilter(s, "closed"))).toEqual([
      eatenClosed,
      wishClosed,
    ]);
  });
});
