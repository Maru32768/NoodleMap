import { toaster } from "@/components/ui/toaster.tsx";
import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import type { components } from "@/generated/api.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

type VisitLog = components["schemas"]["VisitLog"];
type VisitLogInput = components["schemas"]["VisitLogInput"];

afterEach(() => {
  toaster.remove();
  vi.useRealTimers();
});

const shop = makeShop({ name: "中華そば 青葉", eaten: true, visitCount: 1 });

const visit: VisitLog = {
  id: "00000000-0000-4000-8000-0000000000b1",
  visitedOn: "2026-09-30",
  menuName: "中華そば",
  isLimitedMenu: false,
  price: 950,
  rate: 70,
  publicNote: "あっさり",
  privateNote: "次は大盛り",
};

// Renders the edit modal on 訪問ログ and records the API traffic.
function renderVisits({
  visits = [visit],
  saveResponse = (body: VisitLogInput) =>
    HttpResponse.json({ id: "new", ...body }),
}: {
  visits?: VisitLog[];
  saveResponse?: (body: VisitLogInput) => Response;
} = {}) {
  const posted: VisitLogInput[] = [];
  const put: VisitLogInput[] = [];
  const deleted: string[] = [];
  const fetched = { visits: 0, shops: 0 };
  server.use(
    http.get("/api/v1/shops", () => {
      fetched.shops++;
      return HttpResponse.json({ shops: [shop] });
    }),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.get(`/api/v1/shops/${shop.id}/visits`, () => {
      fetched.visits++;
      return HttpResponse.json({ visits });
    }),
    http.post(`/api/v1/auth/shops/${shop.id}/visits`, async ({ request }) => {
      const body = (await request.json()) as VisitLogInput;
      posted.push(body);
      return saveResponse(body);
    }),
    http.put("/api/v1/auth/visits/:visitId", async ({ request }) => {
      const body = (await request.json()) as VisitLogInput;
      put.push(body);
      return saveResponse(body);
    }),
    http.delete("/api/v1/auth/visits/:visitId", ({ params }) => {
      deleted.push(params.visitId as string);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(
    <ShopEditModal
      shop={shop}
      open
      initialTab="visit"
      onClose={vi.fn()}
      onDeleted={vi.fn()}
    />,
  );
  return { posted, put, deleted, fetched };
}

const form = () => screen.getByRole("group", { name: /訪問/ });
const save = () =>
  userEvent.click(within(form()).getByRole("button", { name: "訪問を保存" }));

describe("VisitLogEditor", () => {
  it("lists the shop's visits with both notes", async () => {
    renderVisits();

    const list = await screen.findByRole("list", { name: "訪問ログ" });
    const entry = within(list).getByRole("listitem");
    expect(entry).toHaveTextContent("2026/9/30");
    expect(entry).toHaveTextContent("¥950");
    expect(within(entry).getByText("メモ（公開）")).toBeInTheDocument();
    expect(within(entry).getByText("次は大盛り")).toBeInTheDocument();
  });

  it("records a visit dated today in Japan and refetches the visits and shops", async () => {
    // 2026-10-22 16:00 UTC is already 10/23 in Japan.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T16:00:00Z"));
    const { posted, fetched } = renderVisits();
    await screen.findByRole("list", { name: "訪問ログ" });
    const before = { ...fetched };

    await userEvent.click(screen.getByRole("button", { name: "訪問を記録" }));
    expect(within(form()).getByLabelText("訪問日")).toHaveValue("2026-10-23");
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "食べたメニュー" }),
      "限定煮干し",
    );
    await userEvent.click(within(form()).getByRole("checkbox"));
    await userEvent.type(
      within(form()).getByRole("spinbutton", { name: "価格" }),
      "1200",
    );
    await userEvent.type(
      within(form()).getByRole("spinbutton", { name: "評価" }),
      "85",
    );
    await save();

    expect(
      await screen.findByText("訪問ログを保存しました"),
    ).toBeInTheDocument();
    expect(posted).toEqual([
      {
        visitedOn: "2026-10-23",
        menuName: "限定煮干し",
        isLimitedMenu: true,
        price: 1200,
        rate: 85,
      },
    ]);
    await waitFor(() => {
      expect(fetched.visits).toBeGreaterThan(before.visits);
      expect(fetched.shops).toBeGreaterThan(before.shops);
    });
    expect(screen.queryByRole("group", { name: /訪問/ })).toBeNull();
  });

  it("omits a cleared date and a blank rate (日付不明, 未評価)", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.clear(within(form()).getByLabelText("訪問日"));
    await save();

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual({ isLimitedMenu: false });
  });

  it("shows server field errors under their inputs and keeps the form open", async () => {
    renderVisits({
      saveResponse: () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [
              { field: "rate", type: "out_of_range" },
              { field: "visitedOn", type: "out_of_range" },
            ],
          },
          { status: 400 },
        ),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("spinbutton", { name: "評価" }),
      "120",
    );
    await save();

    const rate = await within(form()).findByRole("spinbutton", {
      name: "評価",
      description: "0〜100の範囲で入力してください",
    });
    expect(rate).toHaveAttribute("aria-invalid", "true");
    expect(
      within(form()).getByText("明日以前の日付を入力してください"),
    ).toBeInTheDocument();
    expect(screen.queryByText("訪問ログを保存しました")).toBeNull();

    // Editing a field clears only its own error.
    await userEvent.clear(rate);
    expect(rate).not.toHaveAttribute("aria-invalid");
    expect(
      within(form()).getByText("明日以前の日付を入力してください"),
    ).toBeInTheDocument();
  });

  it("toasts an error that belongs to no field", async () => {
    renderVisits({
      saveResponse: () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await save();

    expect(
      await screen.findByText("訪問ログを保存できませんでした"),
    ).toBeInTheDocument();
    expect(form()).toBeInTheDocument();
  });

  it("edits a visit starting from its values", async () => {
    const { put } = renderVisits();

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問ログを編集" }),
    );
    const notes = within(form()).getByRole("textbox", {
      name: "メモ（自分用）",
    });
    expect(notes).toHaveValue("次は大盛り");
    await userEvent.clear(notes);
    await save();

    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]).toEqual({
      visitedOn: "2026-09-30",
      menuName: "中華そば",
      isLimitedMenu: false,
      price: 950,
      rate: 70,
      publicNote: "あっさり",
    });
  });

  it("deletes a visit after confirmation", async () => {
    const { deleted } = renderVisits();

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問ログを削除" }),
    );
    const message = await screen.findByText(
      "2026/9/30の訪問ログを削除しますか？この操作は取り消せません。",
    );
    await userEvent.click(
      within(message.closest<HTMLElement>("[role=dialog]")!).getByRole(
        "button",
        { name: "削除" },
      ),
    );

    expect(
      await screen.findByText("訪問ログを削除しました"),
    ).toBeInTheDocument();
    expect(deleted).toEqual([visit.id]);
  });
});
