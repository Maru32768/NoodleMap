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
  menuItems: [{ name: "中華そば", isLimited: false, price: 950 }],
  totalPrice: 950,
  rate: 70,
  publicNote: "あっさり",
  privateNote: "次は大盛り",
  images: [],
};

// Renders the edit modal on 訪問ログ and records the API traffic.
function renderVisits({
  target = shop,
  visits = [visit],
  saveResponse = (body: VisitLogInput) =>
    HttpResponse.json({ id: "new", ...body }),
  deleteResponse = () => new HttpResponse(null, { status: 204 }),
}: {
  target?: typeof shop;
  visits?: VisitLog[];
  saveResponse?: (body: VisitLogInput) => Response | Promise<Response>;
  deleteResponse?: () => Response;
} = {}) {
  const posted: VisitLogInput[] = [];
  const put: VisitLogInput[] = [];
  const deleted: string[] = [];
  const fetched = { visits: 0, shops: 0 };
  // Swappable so a test can fail a later refetch.
  let visitsResponse = () => HttpResponse.json({ visits });
  server.use(
    http.get("/api/v1/shops", () => {
      fetched.shops++;
      return HttpResponse.json({ shops: [target] });
    }),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.get(`/api/v1/shops/${target.id}/visits`, () => {
      fetched.visits++;
      return visitsResponse();
    }),
    http.post(`/api/v1/auth/shops/${target.id}/visits`, async ({ request }) => {
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
      return deleteResponse();
    }),
  );
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  renderWithProviders(
    <ShopEditModal
      shop={target}
      open
      initialTab="visit"
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  );
  return {
    onDeleted,
    posted,
    put,
    deleted,
    fetched,
    onClose,
    failVisitsRefetch: () => {
      visitsResponse = () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 });
    },
  };
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
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "限定煮干し",
    );
    await userEvent.click(within(form()).getByRole("checkbox"));
    await userEvent.type(
      within(form()).getByRole("spinbutton", { name: "価格" }),
      "1200",
    );
    await userEvent.type(
      within(form()).getByRole("spinbutton", { name: "お気に入り度" }),
      "85",
    );
    await save();

    expect(
      await screen.findByText("訪問ログを保存しました"),
    ).toBeInTheDocument();
    expect(posted).toEqual([
      {
        visitedOn: "2026-10-23",
        menuItems: [{ name: "限定煮干し", isLimited: true, price: 1200 }],
        rate: 85,
      },
    ]);
    await waitFor(() => {
      expect(fetched.visits).toBeGreaterThan(before.visits);
      expect(fetched.shops).toBeGreaterThan(before.shops);
    });
    expect(screen.queryByRole("group", { name: /訪問/ })).toBeNull();
  });

  it("omits a cleared date and a blank rate (日付不明, 未設定)", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.clear(within(form()).getByLabelText("訪問日"));
    await save();

    await waitFor(() => expect(posted).toHaveLength(1));
    // The empty menu row is dropped too.
    expect(posted[0]).toEqual({});
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
      within(form()).getByRole("spinbutton", { name: "お気に入り度" }),
      "85",
    );
    await save();

    const rate = await within(form()).findByRole("spinbutton", {
      name: "お気に入り度",
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
      menuItems: [{ name: "中華そば", isLimited: false, price: 950 }],
      rate: 70,
      publicNote: "あっさり",
    });
  });

  it("records several menu items in the order arranged, dropping blank rows", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    const row = (n: number) =>
      within(form()).getByRole("group", { name: `メニュー ${n}` });
    const addRow = () =>
      userEvent.click(
        within(form()).getByRole("button", { name: "＋ メニューを追加" }),
      );

    await userEvent.type(
      within(row(1)).getByRole("textbox", { name: "メニュー名" }),
      "替え玉",
    );
    await userEvent.type(
      within(row(1)).getByRole("spinbutton", { name: "価格" }),
      "150",
    );
    await addRow();
    await userEvent.type(
      within(row(2)).getByRole("textbox", { name: "メニュー名" }),
      "限定煮干しそば",
    );
    await userEvent.click(
      within(row(2)).getByRole("checkbox", { name: "限定" }),
    );
    await userEvent.type(
      within(row(2)).getByRole("spinbutton", { name: "価格" }),
      "1200",
    );
    await addRow();
    await userEvent.type(
      within(row(3)).getByRole("textbox", { name: "メニュー名" }),
      "味玉",
    );
    await addRow();
    expect(within(form()).getByText("¥1,350")).toBeInTheDocument();

    // The noodles first; the extra 味玉 row goes, the blank last row is dropped.
    await userEvent.click(within(row(2)).getByRole("button", { name: "上へ" }));
    await userEvent.click(
      within(row(3)).getByRole("button", { name: "メニューを削除" }),
    );
    await save();

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].menuItems).toEqual([
      { name: "限定煮干しそば", isLimited: true, price: 1200 },
      { name: "替え玉", isLimited: false, price: 150 },
    ]);
  });

  it("blocks saving a menu price without a name", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("spinbutton", { name: "価格" }),
      "900",
    );
    await save();

    const name = await within(form()).findByRole("textbox", {
      name: "メニュー名",
      description: "メニュー名を入力してください",
    });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(posted).toHaveLength(0);

    // Typing the name clears its error.
    await userEvent.type(name, "つけ麺");
    expect(name).not.toHaveAttribute("aria-invalid");
  });

  it("blocks saving a 限定 menu item without a name", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.click(
      within(form()).getByRole("checkbox", { name: "限定" }),
    );
    await save();

    expect(
      await within(form()).findByRole("textbox", {
        name: "メニュー名",
        description: "メニュー名を入力してください",
      }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(posted).toHaveLength(0);
  });

  it("does not count adding and removing a blank menu row as unsaved", async () => {
    const { onClose } = renderVisits();

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問ログを編集" }),
    );
    await userEvent.click(
      within(form()).getByRole("button", { name: "＋ メニューを追加" }),
    );
    await userEvent.click(
      within(
        within(form()).getByRole("group", { name: "メニュー 2" }),
      ).getByRole("button", { name: "メニューを削除" }),
    );
    // A blank row left behind is no change either.
    await userEvent.click(
      within(form()).getByRole("button", { name: "＋ メニューを追加" }),
    );
    await userEvent.click(
      screen
        .getAllByRole("button", { name: "キャンセル" })
        .find((button) => !form().contains(button))!,
    );

    expect(onClose).toHaveBeenCalled();
    expect(
      screen.queryByText("保存していない訪問ログがあります。破棄しますか？"),
    ).toBeNull();
  });

  it("names the menu item a server error is about, and tells too many items apart", async () => {
    let fieldErrors = [
      {
        field: "menuItems",
        type: "out_of_range",
        message: "menuItems[1].price",
      },
    ];
    renderVisits({
      visits: [],
      saveResponse: () =>
        HttpResponse.json(
          { type: "invalid_request", fieldErrors },
          { status: 400 },
        ),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    await save();
    expect(
      await within(form()).findByText(
        "メニュー 2 の価格は0〜10,000,000の範囲で入力してください",
      ),
    ).toBeInTheDocument();

    fieldErrors = [
      {
        field: "menuItems",
        type: "out_of_range",
        message: "at most 10 menu items",
      },
    ];
    await save();
    expect(
      await within(form()).findByText("メニューは10品まで記録できます"),
    ).toBeInTheDocument();
  });

  it("allows at most 10 menu items", async () => {
    renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    const add = within(form()).getByRole("button", {
      name: "＋ メニューを追加",
    });
    for (let i = 1; i < 10; i++) {
      await userEvent.click(add);
    }
    expect(
      within(form()).getAllByRole("textbox", { name: "メニュー名" }),
    ).toHaveLength(10);
    expect(add).toBeDisabled();
  });

  it("shows a server error on the menu items under the list", async () => {
    renderVisits({
      visits: [],
      saveResponse: () =>
        HttpResponse.json(
          {
            type: "invalid_request",
            fieldErrors: [
              {
                field: "menuItems",
                type: "too_long",
                message: "menuItems[0].name",
              },
            ],
          },
          { status: 400 },
        ),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    await save();

    expect(
      await within(form()).findByText(
        "メニュー 1 のメニュー名は200文字以内で入力してください",
      ),
    ).toBeInTheDocument();
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

  it("blocks a non-integer or out-of-range price before saving", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    const price = within(form()).getByRole("spinbutton", { name: "価格" });
    await userEvent.type(price, "1.5");
    await save();
    expect(
      await within(form()).findByRole("spinbutton", {
        name: "価格",
        description: "価格は整数で入力してください",
      }),
    ).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(price);
    await userEvent.type(price, "20000000");
    await save();
    expect(
      await within(form()).findByText(
        "価格は0〜10,000,000の範囲で入力してください",
      ),
    ).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it("closes the form and says so when the edited visit was deleted elsewhere", async () => {
    renderVisits({
      saveResponse: () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問ログを編集" }),
    );
    await save();

    expect(
      await screen.findByText("この訪問ログはすでに削除されています"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /訪問/ })).toBeNull();
  });

  it("says so when the visit to delete was already deleted", async () => {
    renderVisits({
      deleteResponse: () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問ログを削除" }),
    );
    const message = await screen.findByText(/の訪問ログを削除しますか/);
    await userEvent.click(
      within(message.closest<HTMLElement>("[role=dialog]")!).getByRole(
        "button",
        { name: "削除" },
      ),
    );

    expect(
      await screen.findByText("この訪問ログはすでに削除されています"),
    ).toBeInTheDocument();
    expect(screen.queryByText("訪問ログを削除しました")).toBeNull();
  });

  it("keeps showing the cached visits when a refetch fails", async () => {
    const { failVisitsRefetch } = renderVisits();
    await screen.findByRole("list", { name: "訪問ログ" });
    failVisitsRefetch();

    await userEvent.click(
      screen.getByRole("button", { name: "訪問ログを編集" }),
    );
    await save();

    expect(
      await screen.findByText(
        "訪問ログを更新できませんでした。表示は前回の内容です",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "訪問ログ" })).toHaveTextContent(
      "中華そば",
    );
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("keeps a visit draft across tab switches", async () => {
    renderVisits();

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    await userEvent.click(screen.getByRole("button", { name: "店舗情報" }));
    await userEvent.click(screen.getByRole("button", { name: "訪問ログ" }));

    expect(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
    ).toHaveValue("つけ麺");
  });

  it("asks before closing with an unsaved visit draft", async () => {
    const { onClose } = renderVisits();

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    // The modal footer's キャンセル, not the visit form's.
    const footerCancel = screen
      .getAllByRole("button", { name: "キャンセル" })
      .find((button) => !form().contains(button))!;
    await userEvent.click(footerCancel);

    expect(
      await screen.findByText(
        "保存していない訪問ログがあります。破棄しますか？",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "入力に戻る" }));
    expect(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
    ).toHaveValue("つけ麺");

    await userEvent.click(footerCancel);
    await userEvent.click(
      await screen.findByRole("button", { name: "破棄する" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before saving the shop with an unsaved visit draft", async () => {
    const shopSaves: unknown[] = [];
    renderVisits();
    server.use(
      http.put(`/api/v1/auth/shops/${shop.id}`, async ({ request }) => {
        shopSaves.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText(
        "保存していない訪問ログがあります。破棄しますか？",
      ),
    ).toBeInTheDocument();
    expect(shopSaves).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "破棄する" }));
    await waitFor(() => expect(shopSaves).toHaveLength(1));
  });

  it("closes the modal when adding finds the shop deleted elsewhere", async () => {
    const { onClose, onDeleted } = renderVisits({
      saveResponse: () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await save();

    expect(
      await screen.findByText("この店舗はすでに削除されています"),
    ).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledWith(shop.id);
    expect(onClose).toHaveBeenCalled();
    expect(
      screen.queryByText("この訪問ログはすでに削除されています"),
    ).toBeNull();
  });

  it("blocks saving a number the browser could not parse", async () => {
    const { posted } = renderVisits({ visits: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    // jsdom cannot hold unparsable text in a number input; fake what a browser reports.
    const price = within(form()).getByRole("spinbutton", { name: "価格" });
    Object.defineProperty(price, "validity", { value: { badInput: true } });
    await save();

    expect(
      await within(form()).findByText("価格は整数で入力してください"),
    ).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it("drops the discarded draft", async () => {
    renderVisits();
    // Discarding goes on to save the shop; let that finish inside the test.
    server.use(
      http.put(
        `/api/v1/auth/shops/${shop.id}`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "破棄する" }),
    );

    // Back on the list, and nothing left to ask about.
    expect(screen.queryByRole("group", { name: /訪問/ })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "訪問を記録" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("保存しました")).toBeInTheDocument();
  });

  it("asks before deleting the shop with an unsaved visit draft", async () => {
    renderVisits({
      target: makeShop({ name: "訪問なしの店", eaten: false }),
      visits: [],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    await userEvent.type(
      within(form()).getByRole("textbox", { name: "メニュー名" }),
      "つけ麺",
    );
    await userEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(
      await screen.findByText(
        "保存していない訪問ログがあります。破棄しますか？",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "破棄する" }));
    expect(
      await screen.findByText(
        "「訪問なしの店」を削除しますか？この操作は取り消せません。",
      ),
    ).toBeInTheDocument();
  });

  it("locks closing the modal while a visit save is in flight", async () => {
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => (respond = resolve));
    renderVisits({
      saveResponse: async (body) => {
        await responded;
        return HttpResponse.json({ id: "new", ...body });
      },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "訪問を記録" }),
    );
    const footerCancel = screen
      .getAllByRole("button", { name: "キャンセル" })
      .find((button) => !form().contains(button))!;
    await save();

    await waitFor(() => expect(footerCancel).toBeDisabled());
    respond();
    await waitFor(() => expect(footerCancel).toBeEnabled());
  });
});
