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
  const group = screen.getByRole("radiogroup", { name: "気になる度" });
  const option = (name: string) => within(group).getByRole("radio", { name });
  return { onFilterChange, option };
}

describe("ShopFilters 気になる度", () => {
  it("checks exactly the current floor and picks another", async () => {
    const { onFilterChange, option } = renderFilters({ wishMin: "medium" });
    expect(option("すべて")).toHaveAttribute("aria-checked", "false");
    expect(option("気になる以上")).toHaveAttribute("aria-checked", "true");
    expect(option("絶対行きたいのみ")).toHaveAttribute("aria-checked", "false");

    await userEvent.click(option("絶対行きたいのみ"));
    expect(onFilterChange).toHaveBeenLastCalledWith("wishMin", "high");
    await userEvent.click(option("すべて"));
    expect(onFilterChange).toHaveBeenLastCalledWith("wishMin", "all");
  });

  it("moves the choice with arrow keys from a single tab stop", async () => {
    const { onFilterChange, option } = renderFilters({ wishMin: "all" });
    expect(option("すべて")).toHaveAttribute("tabindex", "0");
    expect(option("気になる以上")).toHaveAttribute("tabindex", "-1");

    option("すべて").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onFilterChange).toHaveBeenLastCalledWith("wishMin", "medium");
    expect(option("気になる以上")).toHaveFocus();
  });

  it("is disabled while the 気になる visit filter is off", () => {
    const { option } = renderFilters({ wish: false });
    expect(
      screen.getByRole("radiogroup", { name: "気になる度" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(option("気になる以上")).toBeDisabled();
  });

  it("keeps aria-pressed on the multi-toggle chips", () => {
    renderFilters({ eaten: true, wish: false });
    expect(screen.getByRole("button", { name: "食べた" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "気になる" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
