import { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import { MealRecordForm } from "@/features/meal-records/meal-record-form.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { apiOk } from "@/utils/request.ts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

describe("record associations", () => {
  it("preserves every existing shop and venue when suggestions cannot load", async () => {
    const a = makeShop({ name: "A" });
    const b = makeShop({ name: "B" });
    const mealRecord: MealRecord = {
      id: "record",
      shops: [a, b],
      venue: { id: "venue", name: "ラーメンWalkerキッチン" },
      menuItems: [],
      images: [],
    };
    server.use(
      http.get("/api/v1/shops", () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
      ),
      http.get("/api/v1/venues", () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
      ),
    );
    const save = vi.fn(async () => apiOk(mealRecord));
    renderWithProviders(
      <MealRecordForm
        scope={{ kind: "shop", shopId: a.id }}
        mealRecord={mealRecord}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    await screen.findByText(/店舗一覧を読み込めませんでした/);
    await screen.findByText(/出店先の候補を読み込めませんでした/);
    expect(screen.getByLabelText("提供した店舗")).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: "メモ（公開）" }),
      "残す",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "食べた記録を保存" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        shopIds: [a.id, b.id],
        venueName: mealRecord.venue?.name,
        publicNote: "残す",
      }),
    );
  });

  it("allows removing the preselected shop", async () => {
    const a = makeShop({ name: "A" });
    const b = makeShop({ name: "B" });
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: [a, b] })),
      http.get("/api/v1/venues", () => HttpResponse.json({ venues: [] })),
    );
    const save = vi.fn(async () => null);
    renderWithProviders(
      <MealRecordForm
        scope={{ kind: "shop", shopId: a.id }}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    const select = screen.getByLabelText("提供した店舗");
    await waitFor(() => expect(select).toBeEnabled());
    await userEvent.type(select, "B");
    await userEvent.click(screen.getByRole("option", { name: "B" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove A" }));
    await userEvent.click(
      screen.getByRole("button", { name: "食べた記録を保存" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ shopIds: [b.id] }),
    );
  });

  it("saves a record without shops only when it names a venue", async () => {
    const a = makeShop({ name: "A" });
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: [a] })),
      http.get("/api/v1/venues", () => HttpResponse.json({ venues: [] })),
    );
    const save = vi.fn(async () => null);
    renderWithProviders(
      <MealRecordForm
        scope={{ kind: "shop", shopId: a.id }}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    const select = screen.getByLabelText("提供した店舗");
    await waitFor(() => expect(select).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Remove A" }));
    const saveButton = screen.getByRole("button", { name: "食べた記録を保存" });
    await userEvent.click(saveButton);
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText("入力してください")).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("催事・出店先"),
      "日本ご当地ラーメン総選挙",
    );
    await userEvent.click(saveButton);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        shopIds: [],
        venueName: "日本ご当地ラーメン総選挙",
      }),
    );
  });
});
