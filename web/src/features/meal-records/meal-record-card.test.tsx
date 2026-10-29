import { MealRecordCard } from "@/features/meal-records/meal-record-card.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("MealRecordCard", () => {
  it("titles a record served by no registered shop with its venue", () => {
    renderWithProviders(
      <MealRecordCard
        mealRecord={{
          id: "booth",
          shops: [],
          venue: { id: "venue", name: "日本ご当地ラーメン総選挙" },
          menuItems: [{ name: "酒田ラーメン", isLimited: false }],
          images: [],
        }}
        category={undefined}
        showVenue={false}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTitle("日本ご当地ラーメン総選挙")).toHaveTextContent(
      "日本ご当地ラーメン総選挙",
    );
  });
});
