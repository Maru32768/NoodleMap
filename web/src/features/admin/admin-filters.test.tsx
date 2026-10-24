import { AdminFilters } from "@/features/admin/admin-filters.tsx";
import type { VisitFilter } from "@/features/admin/visit-filter.ts";
import type { WishLevel } from "@/features/shops/status.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function renderFilters({
  visitFilter = "all",
  wishLevels = [],
}: {
  visitFilter?: VisitFilter;
  wishLevels?: WishLevel[];
} = {}) {
  const setCategoryFilter = vi.fn();
  const setVisitFilter = vi.fn();
  const setWishLevels = vi.fn();
  const onClearAll = vi.fn();
  renderWithProviders(
    <AdminFilters
      categoryFilter="all"
      setCategoryFilter={setCategoryFilter}
      visitFilter={visitFilter}
      setVisitFilter={setVisitFilter}
      wishLevels={wishLevels}
      setWishLevels={setWishLevels}
      filteredCount={1}
      totalCount={2}
      onClearAll={onClearAll}
    />,
  );
  const option = (group: string, name: string) =>
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", {
      name,
    });
  const wishGroup = screen.getByRole("group", { name: "気になる度" });
  const level = (name: string) =>
    within(wishGroup).getByRole("button", { name });
  return {
    option,
    wishGroup,
    level,
    setCategoryFilter,
    setVisitFilter,
    setWishLevels,
    onClearAll,
  };
}

describe("AdminFilters", () => {
  it("exposes カテゴリ and 状態 as named radio groups", async () => {
    const { option, setCategoryFilter, setVisitFilter } = renderFilters();
    expect(option("カテゴリ", "すべて")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(option("状態", "全て")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("button", { name: "× クリア" })).toBeNull();

    await userEvent.click(option("カテゴリ", "うどん"));
    expect(setCategoryFilter).toHaveBeenCalledWith("udon");
    await userEvent.click(option("状態", "閉店"));
    expect(setVisitFilter).toHaveBeenCalledWith("closed");
  });

  it("exposes 気になる度 as three independent toggles, none pressed by default", async () => {
    const { wishGroup, level, setWishLevels } = renderFilters();
    expect(
      within(wishGroup)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["ちょっと気になる", "気になる", "絶対行きたい"]);
    for (const name of ["ちょっと気になる", "気になる", "絶対行きたい"]) {
      expect(level(name)).toHaveAttribute("aria-pressed", "false");
    }

    await userEvent.click(level("絶対行きたい"));
    expect(setWishLevels).toHaveBeenLastCalledWith(["high"]);
  });

  it("adds to and removes from the selected 気になる度 levels", async () => {
    const { level, setWishLevels } = renderFilters({ wishLevels: ["high"] });
    expect(level("絶対行きたい")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(level("ちょっと気になる"));
    expect(setWishLevels).toHaveBeenLastCalledWith(["low", "high"]);
    await userEvent.click(level("絶対行きたい"));
    expect(setWishLevels).toHaveBeenLastCalledWith([]);
  });

  it("offers × クリア once a 気になる度 level is selected", async () => {
    const { onClearAll } = renderFilters({ wishLevels: ["medium"] });

    await userEvent.click(screen.getByRole("button", { name: "× クリア" }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("disables 気になる度 while 状態 is 食べた", () => {
    const { wishGroup, level } = renderFilters({ visitFilter: "eaten" });
    expect(wishGroup).toHaveAttribute("aria-disabled", "true");
    expect(level("気になる")).toBeDisabled();
  });
});
