import { matchesMealRecordFilter } from "@/features/admin/meal-record-filter.ts";
import { makeShop } from "@/test/fixtures.ts";
import { describe, expect, it } from "vitest";

const eatenOpen = makeShop({ eaten: true });
const wishOpen = makeShop({ eaten: false });
const eatenClosed = makeShop({ eaten: true, closedAt: "2020-01-01" });
const wishClosed = makeShop({ eaten: false, closedAt: "2020-01-01" });
const shops = [eatenOpen, wishOpen, eatenClosed, wishClosed];

describe("matchesMealRecordFilter", () => {
  it("shows every shop for すべて", () => {
    expect(shops.filter((s) => matchesMealRecordFilter(s, "all"))).toEqual(
      shops,
    );
  });

  it("shows only open shops for 食べた and 行きたい", () => {
    expect(shops.filter((s) => matchesMealRecordFilter(s, "eaten"))).toEqual([
      eatenOpen,
    ]);
    expect(shops.filter((s) => matchesMealRecordFilter(s, "wish"))).toEqual([
      wishOpen,
    ]);
  });

  it("shows only shops on 臨時休業 now for 臨時休業", () => {
    const paused = makeShop({ temporaryClosure: { startsOn: "2020-01-01" } });
    const planned = makeShop({ temporaryClosure: { startsOn: "2999-01-01" } });
    expect(
      [...shops, paused, planned].filter((s) =>
        matchesMealRecordFilter(s, "temporarilyClosed"),
      ),
    ).toEqual([paused]);
  });

  it("shows only closed shops for 閉店", () => {
    expect(shops.filter((s) => matchesMealRecordFilter(s, "closed"))).toEqual([
      eatenClosed,
      wishClosed,
    ]);
  });
});
