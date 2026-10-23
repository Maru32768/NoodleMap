import { DEFAULT_FILTERS } from "@/features/search/search-state-storage.ts";
import { ShopFilters } from "@/features/shops/sidebar.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

describe("ShopFilters 気になる度", () => {
  it("shows one pressed chip per option and picks a floor", async () => {
    server.use(http.get("/api/v1/tags", () => HttpResponse.json([])));
    const onFilterChange = vi.fn();
    renderWithProviders(
      <ShopFilters
        filters={{ ...DEFAULT_FILTERS, wishMin: "medium" }}
        onFilterChange={onFilterChange}
      />,
    );

    const group = screen.getByRole("group", { name: "気になる度" });
    const chip = (name: string) => within(group).getByRole("button", { name });
    expect(chip("すべて")).toHaveAttribute("aria-pressed", "false");
    expect(chip("気になる以上")).toHaveAttribute("aria-pressed", "true");
    expect(chip("絶対行きたいのみ")).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(chip("絶対行きたいのみ"));
    expect(onFilterChange).toHaveBeenLastCalledWith("wishMin", "high");
    await userEvent.click(chip("すべて"));
    expect(onFilterChange).toHaveBeenLastCalledWith("wishMin", "all");
  });
});
