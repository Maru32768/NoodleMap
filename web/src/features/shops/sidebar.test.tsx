import { DEFAULT_FILTERS } from "@/features/search/search-state-storage.ts";
import type { SearchFilters } from "@/features/search/utils.ts";
import { ShopFilters } from "@/features/shops/sidebar.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

function renderFilters(filters: Partial<SearchFilters>) {
  server.use(http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })));
  const onFilterChange = vi.fn();
  renderWithProviders(
    <ShopFilters
      filters={{ ...DEFAULT_FILTERS, ...filters }}
      onFilterChange={onFilterChange}
    />,
  );
  const group = screen.getByRole("group", { name: "気になる度" });
  const level = (name: string) => within(group).getByRole("button", { name });
  // The visit chip shares its name with the 気になる level toggle.
  const visitChip = (name: string) => {
    const chips = screen
      .getAllByRole("button", { name })
      .filter((chip) => !group.contains(chip));
    expect(chips).toHaveLength(1);
    return chips[0];
  };
  return { onFilterChange, group, level, visitChip };
}

describe("ShopFilters 気になる度", () => {
  it("offers the three levels, none pressed by default, without すべて", () => {
    const { group, level } = renderFilters({});
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["ちょっと気になる", "気になる", "絶対行きたい"]);
    for (const name of ["ちょっと気になる", "気になる", "絶対行きたい"]) {
      expect(level(name)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("presses the selected levels and toggles each independently", async () => {
    const { onFilterChange, level } = renderFilters({
      wishLevels: ["medium", "high"],
    });
    expect(level("ちょっと気になる")).toHaveAttribute("aria-pressed", "false");
    expect(level("気になる")).toHaveAttribute("aria-pressed", "true");
    expect(level("絶対行きたい")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(level("ちょっと気になる"));
    expect(onFilterChange).toHaveBeenLastCalledWith("wishLevels", [
      "low",
      "medium",
      "high",
    ]);
    await userEvent.click(level("気になる"));
    expect(onFilterChange).toHaveBeenLastCalledWith("wishLevels", ["high"]);
  });

  it("is disabled while the 気になる visit filter is off", () => {
    const { group, level } = renderFilters({ wish: false });
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(level("気になる")).toBeDisabled();
  });

  it("keeps aria-pressed on the visit chips", () => {
    const { visitChip } = renderFilters({ eaten: true, wish: false });
    expect(visitChip("食べた")).toHaveAttribute("aria-pressed", "true");
    expect(visitChip("気になる")).toHaveAttribute("aria-pressed", "false");
  });
});
