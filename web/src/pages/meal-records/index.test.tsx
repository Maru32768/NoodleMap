import {
  type CurrentUser,
  CurrentUserProvider,
} from "@/features/auth/use-current-user.ts";
import type {
  MealRecord,
  MealRecordInput,
} from "@/features/meal-records/api/use-meal-records.ts";
import MealRecordsPage from "@/pages/meal-records/index.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation } from "react-router";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ramen = makeShop({ name: "ラーメン店", category: "ramen" });
const udon = makeShop({ name: "うどん店", category: "udon" });
const record = (id: string, shops: MealRecord["shops"], eatenOn?: string) =>
  ({ id, shops, eatenOn, menuItems: [], images: [] }) satisfies MealRecord;
const fair = { id: "fair", name: "北海道物産展" };
const fes = { id: "fes", name: "ラーメンフェス" };
const ramenOnly = { ...record("r", [ramen], "2024-03-01"), venue: fair };
const collab = { ...record("c", [ramen, udon], "2024-02-01"), venue: fes };
const udonUndated = record("u", [udon]);
const admin: CurrentUser = {
  id: "admin",
  email: "admin@example.com",
  type: "admin",
};

function Search() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderPage(
  url = "/meal-records",
  user: CurrentUser = { type: "guest" },
) {
  let records: MealRecord[] = [
    { ...ramenOnly, publicNote: "濃厚" },
    collab,
    udonUndated,
  ];
  const posted: MealRecordInput[] = [];
  server.use(
    http.get("/api/v1/meal-records", () =>
      HttpResponse.json({ mealRecords: records }),
    ),
    http.get("/api/v1/shops", () =>
      HttpResponse.json({ shops: [ramen, udon] }),
    ),
    http.get("/api/v1/venues", () =>
      HttpResponse.json({ venues: [fair, fes] }),
    ),
    http.post("/api/v1/auth/meal-records", async ({ request }) => {
      const body = (await request.json()) as MealRecordInput;
      posted.push(body);
      const created: MealRecord = {
        ...record("booth", [], body.eatenOn),
        venue: { id: "new-venue", name: body.venueName ?? "" },
      };
      records = [created, ...records];
      return HttpResponse.json(created);
    }),
  );
  renderWithProviders(
    <CurrentUserProvider value={user}>
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
      </MemoryRouter>
    </CurrentUserProvider>,
  );
  return { posted };
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

  it("filters by venue and keeps it in the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await cardShopNames();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "催事・出店先" }),
      fes.name,
    );
    expect(await cardShopNames()).toEqual(["ラーメン店 × うどん店"]);
    expect(screen.getByTestId("search")).toHaveTextContent("?venue=fes");
  });

  it("filters by an inclusive date range, leaving out undated records", async () => {
    renderPage();
    await cardShopNames();
    fireEvent.change(screen.getByLabelText("食べた日（から）"), {
      target: { value: "2024-02-01" },
    });
    expect(await cardShopNames()).toEqual([
      "ラーメン店",
      "ラーメン店 × うどん店",
    ]);
    fireEvent.change(screen.getByLabelText("食べた日（まで）"), {
      target: { value: "2024-02-01" },
    });
    expect(await cardShopNames()).toEqual(["ラーメン店 × うどん店"]);
    expect(screen.getByTestId("search")).toHaveTextContent(
      "?from=2024-02-01&to=2024-02-01",
    );
  });

  it("restores the venue and dates from the URL and says when nothing matches", async () => {
    renderPage("/meal-records?venue=fair&from=2024-01-01&to=2024-12-31");
    expect(await cardShopNames()).toEqual(["ラーメン店"]);
    expect(screen.getByRole("combobox", { name: "催事・出店先" })).toHaveValue(
      "fair",
    );
    expect(screen.getByLabelText("食べた日（から）")).toHaveValue("2024-01-01");
    expect(screen.getByLabelText("食べた日（まで）")).toHaveValue("2024-12-31");

    fireEvent.change(screen.getByLabelText("食べた日（まで）"), {
      target: { value: "2024-01-31" },
    });
    expect(
      await screen.findByText("条件に合う食べた記録がありません"),
    ).toBeInTheDocument();
  });

  it("lets the admin add a record at a new venue and then add its images", async () => {
    const user = userEvent.setup();
    const { posted } = renderPage("/meal-records", admin);
    await cardShopNames();
    await user.click(screen.getByRole("button", { name: "食べた記録を追加" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("催事・出店先")).toHaveValue("");
    await user.type(
      within(dialog).getByLabelText("催事・出店先"),
      "新宿ラーメン博",
    );
    // Esc does not throw away the edited draft.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const save = within(dialog).getByRole("button", {
      name: "食べた記録を保存",
    });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(posted).toEqual([
      expect.objectContaining({ shopIds: [], venueName: "新宿ラーメン博" }),
    ]);
    expect(
      await within(dialog).findByRole("group", { name: /^画像（/ }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows a guest no add button", async () => {
    renderPage();
    await cardShopNames();
    expect(
      screen.queryByRole("button", { name: "食べた記録を追加" }),
    ).not.toBeInTheDocument();
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
