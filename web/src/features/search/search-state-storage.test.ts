import {
  DEFAULT_FILTERS,
  readSavedSearchState,
  writeSavedSearchState,
} from "@/features/search/search-state-storage.ts";
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

  it("round-trips the 気になる度 filter", () => {
    const withWish = {
      ...state,
      filters: { ...state.filters, wishMin: "high" as const },
    };
    writeSavedSearchState(withWish);

    expect(readSavedSearchState()).toEqual({ version: 5, ...withWish });
  });

  it.each([
    ["saved before it existed", undefined],
    ["unknown", "extreme"],
  ])(
    "keeps a state whose 気になる度 filter is %s, reading it as すべて",
    (_, wishMin) => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          ...state,
          version: 5,
          filters: { ...state.filters, wishMin },
        }),
      );

      expect(readSavedSearchState()).toEqual({
        version: 5,
        ...state,
        filters: { ...state.filters, wishMin: "all" },
      });
    },
  );

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
