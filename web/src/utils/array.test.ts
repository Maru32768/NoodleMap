import { useSort } from "@/utils/array.ts";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const rows = [
  { name: "うどん", rate: 70 },
  { name: "あんかけ", rate: 90 },
  { name: "いりこ", rate: 50 },
];

describe("useSort", () => {
  it("returns data unchanged without a key and order", () => {
    const { result } = renderHook(() => useSort(rows));

    expect(result.current.sortedData).toBe(rows);
  });

  it("sorts strings in Japanese collation order", () => {
    const { result } = renderHook(() => useSort(rows, "name", "ASC"));

    expect(result.current.sortedData.map((r) => r.name)).toEqual([
      "あんかけ",
      "いりこ",
      "うどん",
    ]);
  });

  it("sorts numbers and follows key and order changes", () => {
    const { result } = renderHook(() => useSort(rows, "rate", "DESC"));

    expect(result.current.sortedData.map((r) => r.rate)).toEqual([90, 70, 50]);

    act(() => {
      result.current.setSortOrder("ASC");
    });
    expect(result.current.sortedData.map((r) => r.rate)).toEqual([50, 70, 90]);

    act(() => {
      result.current.setSortOrder(undefined);
    });
    expect(result.current.sortedData).toBe(rows);
  });

  it("leaves the input array untouched", () => {
    const input = [...rows];
    renderHook(() => useSort(input, "rate", "ASC"));

    expect(input).toEqual(rows);
  });
});
