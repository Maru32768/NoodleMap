import { AdminFilters } from "@/features/admin/admin-filters.tsx";
import type { VisitFilter } from "@/features/admin/visit-filter.ts";
import type { WishFilter } from "@/features/search/utils.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function renderFilters({
  visitFilter = "all",
  wishFilter = "all",
}: {
  visitFilter?: VisitFilter;
  wishFilter?: WishFilter;
} = {}) {
  const setCategoryFilter = vi.fn();
  const setVisitFilter = vi.fn();
  const setWishFilter = vi.fn();
  const onClearAll = vi.fn();
  renderWithProviders(
    <AdminFilters
      categoryFilter="all"
      setCategoryFilter={setCategoryFilter}
      visitFilter={visitFilter}
      setVisitFilter={setVisitFilter}
      wishFilter={wishFilter}
      setWishFilter={setWishFilter}
      filteredCount={1}
      totalCount={2}
      onClearAll={onClearAll}
    />,
  );
  const option = (group: string, name: string) =>
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", {
      name,
    });
  return {
    option,
    setCategoryFilter,
    setVisitFilter,
    setWishFilter,
    onClearAll,
  };
}

describe("AdminFilters", () => {
  it("exposes カテゴリ, 状態 and 気になる度 as named radio groups", async () => {
    const { option, setCategoryFilter, setVisitFilter, setWishFilter } =
      renderFilters();
    expect(option("カテゴリ", "すべて")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(option("状態", "全て")).toHaveAttribute("aria-checked", "true");
    expect(option("気になる度", "すべて")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("button", { name: "× クリア" })).toBeNull();

    await userEvent.click(option("カテゴリ", "うどん"));
    expect(setCategoryFilter).toHaveBeenCalledWith("udon");
    await userEvent.click(option("状態", "閉店"));
    expect(setVisitFilter).toHaveBeenCalledWith("closed");
    await userEvent.click(option("気になる度", "気になる以上"));
    expect(setWishFilter).toHaveBeenCalledWith("medium");
  });

  it("offers × クリア once a 気になる度 floor is set", async () => {
    const { option, onClearAll } = renderFilters({ wishFilter: "high" });
    expect(option("気になる度", "絶対行きたいのみ")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "× クリア" }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("disables 気になる度 while 状態 is 食べた", () => {
    const { option } = renderFilters({ visitFilter: "eaten" });
    expect(
      screen.getByRole("radiogroup", { name: "気になる度" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(option("気になる度", "気になる以上")).toBeDisabled();
  });
});
