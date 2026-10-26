import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import { MealRecordList } from "@/features/meal-records/meal-record-list.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

const a = { id: "shop-a", name: "提供店A" };
const b = { id: "shop-b", name: "提供店B" };
const record: MealRecord = {
  id: "record",
  shops: [a],
  menuItems: [],
  images: [],
};

describe("MealRecordList provider names", () => {
  it("omits the sole provider matching the shop being viewed", () => {
    renderWithProviders(
      <MemoryRouter>
        <MealRecordList mealRecords={[record]} contextShopId={a.id} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("list", { name: "食べた記録" })).toHaveTextContent(
      "日付不明",
    );
    expect(screen.queryByText(a.name)).not.toBeInTheDocument();
  });

  it.each([undefined, b.id])(
    "shows a sole provider outside its own shop context (%s)",
    (contextShopId) => {
      renderWithProviders(
        <MemoryRouter>
          <MealRecordList
            mealRecords={[record]}
            contextShopId={contextShopId}
          />
        </MemoryRouter>,
      );
      expect(screen.getByRole("link", { name: a.name })).toHaveAttribute(
        "href",
        "/search?shop=shop-a",
      );
    },
  );

  it("shows every provider of a collaboration even in one provider's history", () => {
    renderWithProviders(
      <MemoryRouter>
        <MealRecordList
          mealRecords={[{ ...record, shops: [a, b] }]}
          contextShopId={a.id}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      [a.name, b.name],
    );
  });

  it("keeps collaboration and venue names plain inside the editor", () => {
    renderWithProviders(
      <MealRecordList
        mealRecords={[
          { ...record, shops: [a, b], venue: { id: "venue", name: "会場" } },
        ]}
        contextShopId={a.id}
        navigation={false}
      />,
    );
    const list = screen.getByRole("list", { name: "食べた記録" });
    expect(list).toHaveTextContent(a.name);
    expect(list).toHaveTextContent(b.name);
    expect(list).toHaveTextContent("会場");
    expect(within(list).queryByRole("link")).not.toBeInTheDocument();
  });
});
