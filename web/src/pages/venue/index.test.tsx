import {
  CurrentUser,
  CurrentUserProvider,
} from "@/features/auth/use-current-user.ts";
import type {
  MealRecord,
  MealRecordInput,
} from "@/features/meal-records/api/use-meal-records.ts";
import VenuePage from "@/pages/venue/index.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

const admin: CurrentUser = {
  id: "admin",
  email: "admin@example.com",
  type: "admin",
};
const venue = { id: "venue-1", name: "日本ご当地ラーメン総選挙" };

function renderVenue(user: CurrentUser) {
  let records: MealRecord[] = [];
  const posted: MealRecordInput[] = [];
  server.use(
    http.get(`/api/v1/venues/${venue.id}/meal-records`, () =>
      HttpResponse.json({ venue, mealRecords: records }),
    ),
    http.get("/api/v1/venues", () => HttpResponse.json({ venues: [venue] })),
    http.get("/api/v1/shops", () => HttpResponse.json({ shops: [] })),
    http.get("/api/v1/meal-records", () =>
      HttpResponse.json({ mealRecords: records }),
    ),
    http.post("/api/v1/auth/meal-records", async ({ request }) => {
      const body = (await request.json()) as MealRecordInput;
      posted.push(body);
      const record: MealRecord = {
        id: "booth",
        shops: [],
        venue,
        eatenOn: body.eatenOn,
        menuItems: (body.menuItems ?? []).map((item) => ({
          ...item,
          isLimited: item.isLimited ?? false,
        })),
        publicNote: body.publicNote,
        images: [],
      };
      records = [record];
      return HttpResponse.json(record);
    }),
  );
  renderWithProviders(
    <CurrentUserProvider value={user}>
      <MemoryRouter initialEntries={[`/venues/${venue.id}`]}>
        <Routes>
          <Route path="/venues/:venueId" element={<VenuePage />} />
        </Routes>
      </MemoryRouter>
    </CurrentUserProvider>,
  );
  return { posted };
}

describe("VenuePage", () => {
  it("lets the admin add a record of a booth served by no registered shop", async () => {
    const { posted } = renderVenue(admin);
    await userEvent.click(
      await screen.findByRole("button", { name: "記録を管理" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "食べた記録を追加" }),
    );
    expect(screen.getByLabelText("催事・出店先")).toHaveValue(venue.name);
    await userEvent.type(
      screen.getByRole("textbox", { name: "メモ（公開）" }),
      "酒田ラーメンのブース",
    );
    const save = screen.getByRole("button", { name: "食べた記録を保存" });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(posted).toEqual([
      expect.objectContaining({
        shopIds: [],
        venueName: venue.name,
        publicNote: "酒田ラーメンのブース",
      }),
    ]);
    const list = await screen.findByRole("list", { name: "食べた記録" });
    expect(
      within(list).getByRole("button", { name: "食べた記録を編集" }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("button", { name: "食べた記録を削除" }),
    ).toBeInTheDocument();
  });

  it("shows no admin controls to a guest", async () => {
    renderVenue({ type: "guest" });
    await screen.findByText("まだ食べた記録がありません");
    expect(
      screen.queryByRole("button", { name: "記録を管理" }),
    ).not.toBeInTheDocument();
  });
});
