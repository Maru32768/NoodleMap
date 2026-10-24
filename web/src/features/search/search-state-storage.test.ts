import {
  DEFAULT_FILTERS,
  readSavedSearchState,
  writeSavedSearchState,
} from "@/features/search/search-state-storage.ts";
import { omit } from "es-toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";

const KEY = "noodle-map:search-state:v1";

const state = {
  query: "醤油",
  filters: { ...DEFAULT_FILTERS, favMin: 60, tagIds: ["system:open"] },
  mapView: { center: [34.7, 135.5] as [number, number], zoom: 15 },
};

describe("search state storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a written state", () => {
    writeSavedSearchState(state);

    expect(readSavedSearchState()).toEqual({ version: 5, ...state });
  });

  it("round-trips the 気になる度 levels", () => {
    const withWish = {
      ...state,
      filters: {
        ...state.filters,
        wishLevels: ["low" as const, "high" as const],
      },
    };
    writeSavedSearchState(withWish);

    expect(readSavedSearchState()).toEqual({ version: 5, ...withWish });
  });

  function readWithFilters(filters: Record<string, unknown>) {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...state,
        version: 5,
        filters: { ...omit(state.filters, ["wishLevels"]), ...filters },
      }),
    );
    return readSavedSearchState();
  }

  it.each([
    ["missing", {}, []],
    ["すべて", { wishMin: "all" }, []],
    ["気になる以上", { wishMin: "medium" }, ["medium", "high"]],
    ["絶対行きたいのみ", { wishMin: "high" }, ["high"]],
    ["an unknown floor", { wishMin: "extreme" }, []],
    ["the removed ちょっと気になる以上", { wishMin: "low" }, []],
  ])(
    "migrates a legacy 気になる度 floor that is %s",
    (_, legacy, wishLevels) => {
      expect(readWithFilters(legacy)).toEqual({
        version: 5,
        ...state,
        filters: { ...state.filters, wishLevels },
      });
    },
  );

  it("drops unknown and repeated 気になる度 levels and sorts them low→high", () => {
    expect(
      readWithFilters({ wishLevels: ["high", "extreme", 1, "low", "high"] })
        ?.filters.wishLevels,
    ).toEqual(["low", "high"]);
  });

  it.each([
    ["levels", { wishLevels: ["high"] }],
    ["a legacy floor", { wishMin: "high" }],
  ])("drops 気になる度 %s saved while 気になる is off", (_, wishFields) => {
    expect(
      readWithFilters({ wish: false, ...wishFields })?.filters.wishLevels,
    ).toEqual([]);
  });

  it("returns null when nothing is saved", () => {
    expect(readSavedSearchState()).toBeNull();
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["an older version", JSON.stringify({ ...state, version: 4 })],
    ["a non-string query", JSON.stringify({ ...state, version: 5, query: 1 })],
    [
      "a filter missing a toggle",
      JSON.stringify({
        ...state,
        version: 5,
        filters: { ...state.filters, udon: undefined },
      }),
    ],
    [
      "a non-string tag id",
      JSON.stringify({
        ...state,
        version: 5,
        filters: { ...state.filters, tagIds: [1] },
      }),
    ],
    [
      "a non-finite map center",
      JSON.stringify({
        ...state,
        version: 5,
        mapView: { center: [null, 135], zoom: 15 },
      }),
    ],
    [
      "a missing zoom",
      JSON.stringify({
        ...state,
        version: 5,
        mapView: { center: [34.7, 135.5] },
      }),
    ],
  ])("discards %s and clears it from storage", (_, raw) => {
    localStorage.setItem(KEY, raw);

    expect(readSavedSearchState()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("returns null without throwing when storage is unavailable", () => {
    const denied = () => {
      throw new DOMException("Access denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(denied);

    expect(readSavedSearchState()).toBeNull();
  });
});
