import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import MealRecordsPage from "@/pages/meal-records/index.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ramen = makeShop({ name: "ラーメン店", category: "ramen" });
const udon = makeShop({ name: "うどん店", category: "udon" });
const record = (id: string, shops: MealRecord["shops"], eatenOn?: string) =>
  ({ id, shops, eatenOn, menuItems: [], images: [] }) satisfies MealRecord;
const ramenOnly = record("r", [ramen], "2024-03-01");
const collab = record("c", [ramen, udon], "2024-02-01");
const udonUndated = record("u", [udon]);

function Search() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderPage(url = "/meal-records") {
  server.use(
    http.get("/api/v1/meal-records", () =>
      HttpResponse.json({
        mealRecords: [
          { ...ramenOnly, publicNote: "濃厚" },
          collab,
          udonUndated,
        ],
      }),
    ),
    http.get("/api/v1/shops", () =>
      HttpResponse.json({ shops: [ramen, udon] }),
    ),
  );
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <VirtuosoGridMockContext.Provider
        value={{
          viewportHeight: 2000,
          viewportWidth: 1000,
          itemHeight: 300,
          itemWidth: 250,
        }}
      >
        <MealRecordsPage />
        <Search />
      </VirtuosoGridMockContext.Provider>
    </MemoryRouter>,
  );
}

// The cards' shop names in grid order, once the shops' categories have loaded.
async function cardShopNames() {
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "うどん" })).toBeEnabled(),
  );
  return screen
    .getAllByTitle(/店/)
    .map((element) => element.getAttribute("title"));
}

describe("MealRecordsPage", () => {
  // jsdom has no ResizeObserver, which VirtuosoGrid uses on its custom scroll parent.
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    return () => vi.unstubAllGlobals();
  });

  it("lists every record newest first and filters by any shop's category", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await cardShopNames()).toEqual([
      "ラーメン店",
      "ラーメン店 × うどん店",
      "うどん店",
    ]);

    await user.click(screen.getByRole("radio", { name: "うどん" }));
    expect(await cardShopNames()).toEqual([
      "ラーメン店 × うどん店",
      "うどん店",
    ]);
    expect(screen.getByTestId("search")).toHaveTextContent("?category=udon");
  });

  it("reverses the order, putting the undated record first, and keeps it in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await cardShopNames();
    await user.click(screen.getByRole("radio", { name: "古い順" }));
    expect(await cardShopNames()).toEqual([
      "うどん店",
      "ラーメン店 × うどん店",
      "ラーメン店",
    ]);
    expect(screen.getByTestId("search")).toHaveTextContent("?order=asc");
  });

  it("restores the filter and order from the URL", async () => {
    renderPage("/meal-records?category=ramen&order=asc");
    expect(await cardShopNames()).toEqual([
      "ラーメン店 × うどん店",
      "ラーメン店",
    ]);
    expect(screen.getByRole("radio", { name: "ラーメン" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "古い順" })).toBeChecked();
  });

  it("opens a record's details in a modal", async () => {
    const user = userEvent.setup();
    renderPage();
    await cardShopNames();
    expect(screen.queryByText("濃厚")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /ラーメン店/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("濃厚")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "ラーメン店" }),
    ).toHaveAttribute("href", `/search?shop=${ramen.id}`);
  });
});
