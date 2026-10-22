import {
  DEFAULT_FILTERS,
  DEFAULT_MAP_VIEW,
  readSavedSearchState,
  writeSavedSearchState,
} from "@/features/search/search-state-storage.ts";
import { useSearchState } from "@/features/search/use-search-state.ts";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("useSearchState", () => {
  it("starts from defaults when nothing is saved", () => {
    const { result } = renderHook(() => useSearchState());

    expect(result.current.query).toBe("");
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    expect(result.current.mapView).toEqual(DEFAULT_MAP_VIEW);
    expect(result.current.initialMapView).toEqual(DEFAULT_MAP_VIEW);
  });

  it("restores the previously saved state", () => {
    const saved = {
      query: "うどん",
      filters: { ...DEFAULT_FILTERS, ramen: false },
      mapView: { center: [34.3, 134.0] as [number, number], zoom: 12 },
    };
    writeSavedSearchState(saved);

    const { result } = renderHook(() => useSearchState());

    expect(result.current.query).toBe(saved.query);
    expect(result.current.filters).toEqual(saved.filters);
    expect(result.current.initialMapView).toEqual(saved.mapView);
  });

  it("persists changes so the next visit restores them", () => {
    const { result } = renderHook(() => useSearchState());

    act(() => {
      result.current.handleQueryChange("味噌");
      result.current.handleFilterChange("favMin", 80);
      result.current.handleMapViewChange({ center: [35, 139], zoom: 10 });
    });

    expect(result.current.filters).toEqual({ ...DEFAULT_FILTERS, favMin: 80 });
    expect(readSavedSearchState()).toEqual({
      version: 5,
      query: "味噌",
      filters: { ...DEFAULT_FILTERS, favMin: 80 },
      mapView: { center: [35, 139], zoom: 10 },
    });
  });
});
