import { AdminFilters } from "@/features/admin/admin-filters.tsx";
import type { WishFilter } from "@/features/search/utils.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function renderFilters(wishFilter: WishFilter) {
  const setWishFilter = vi.fn();
  const onClearAll = vi.fn();
  renderWithProviders(
    <AdminFilters
      categoryFilter="all"
      setCategoryFilter={vi.fn()}
      visitFilter="all"
      setVisitFilter={vi.fn()}
      wishFilter={wishFilter}
      setWishFilter={setWishFilter}
      filteredCount={1}
      totalCount={2}
      onClearAll={onClearAll}
    />,
  );
  const group = screen.getByRole("group", { name: "気になる度" });
  const seg = (name: string) => within(group).getByRole("button", { name });
  return { seg, setWishFilter, onClearAll };
}

describe("AdminFilters 気になる度", () => {
  it("picks a floor from the segmented group", async () => {
    const { seg, setWishFilter } = renderFilters("all");
    expect(seg("すべて")).toHaveAttribute("aria-pressed", "true");
    expect(seg("気になる以上")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "× クリア" })).toBeNull();

    await userEvent.click(seg("気になる以上"));
    expect(setWishFilter).toHaveBeenCalledWith("medium");
  });

  it("offers × クリア once a floor is set", async () => {
    const { seg, onClearAll } = renderFilters("high");
    expect(seg("絶対行きたいのみ")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "× クリア" }));
    expect(onClearAll).toHaveBeenCalled();
  });
});
