import { toaster } from "@/components/ui/toaster.tsx";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import type { components } from "@/generated/api.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

type UpdateShopRequest = components["schemas"]["UpdateShopRequest"];

// The toaster store is global; clear it so one test's toast never leaks into the next.
afterEach(() => toaster.remove());

// No visit logs: a shop with any cannot be deleted.
const shop = makeShop({ name: "中華そば 青葉", eaten: false });

function renderModal(deleteResponse: () => Response) {
  server.use(
    http.get("/api/v1/shops", () => HttpResponse.json({ shops: [shop] })),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.delete(`/api/v1/auth/shops/${shop.id}`, deleteResponse),
  );
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  renderWithProviders(
    <ShopEditModal shop={shop} open onClose={onClose} onDeleted={onDeleted} />,
  );
  return { onClose, onDeleted };
}

// Renders the modal for `target` and records each PUT body it saves.
function renderEditor(
  target: Shop,
  {
    saveResponse = () => new HttpResponse(null, { status: 204 }),
    initialTab,
  }: {
    saveResponse?: () => Response | Promise<Response>;
    initialTab?: "info" | "visit";
  } = {},
) {
  const requests: UpdateShopRequest[] = [];
  server.use(
    http.get("/api/v1/shops", () => HttpResponse.json({ shops: [target] })),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.get(`/api/v1/shops/${target.id}/visits`, () =>
      HttpResponse.json({ visits: [] }),
    ),
    http.put(`/api/v1/auth/shops/${target.id}`, async ({ request }) => {
      requests.push((await request.json()) as UpdateShopRequest);
      return saveResponse();
    }),
  );
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const modal = (shop: Shop) => (
    <ShopEditModal
      shop={shop}
      open
      initialTab={initialTab}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
  const { rerender } = renderWithProviders(modal(target));
  return {
    requests,
    onClose,
    onDeleted,
    rerender: (shop: Shop) => rerender(modal(shop)),
  };
}

function fieldErrorResponse(
  fieldErrors: components["schemas"]["UpdateShopFieldError"][],
) {
  return () =>
    HttpResponse.json(
      { type: "invalid_request", fieldErrors },
      { status: 400 },
    );
}

async function confirmDelete() {
  await userEvent.click(screen.getByRole("button", { name: "削除" }));
  const message = await screen.findByText(
    "「中華そば 青葉」を削除しますか？この操作は取り消せません。",
  );
  const confirmDialog = message.closest<HTMLElement>("[role=dialog]")!;
  await userEvent.click(
    within(confirmDialog).getByRole("button", { name: "削除" }),
  );
}

describe("ShopEditModal delete", () => {
  it("deletes the shop after confirmation and closes", async () => {
    const { onClose, onDeleted } = renderModal(
      () => new HttpResponse(null, { status: 204 }),
    );

    await confirmDelete();

    expect(await screen.findByText("店舗を削除しました")).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledWith(shop.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("treats an already deleted shop as deleted", async () => {
    const { onClose, onDeleted } = renderModal(() =>
      HttpResponse.json({ type: "not_found" }, { status: 404 }),
    );

    await confirmDelete();

    expect(await screen.findByText("店舗を削除しました")).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledWith(shop.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("toasts the API error and stays open when deletion fails", async () => {
    const { onClose, onDeleted } = renderModal(() =>
      HttpResponse.json({ type: "permission_denied" }, { status: 403 }),
    );

    await confirmDelete();

    expect(
      await screen.findByText("店舗を削除できませんでした"),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("ShopEditModal save", () => {
  it("saves and closes", async () => {
    const { requests, onClose } = renderEditor(makeShop({ name: "麺屋" }));

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(requests[0]).toMatchObject({ name: "麺屋" });
  });

  it("shows a field error under its input on the tab that has it", async () => {
    const { onClose } = renderEditor(makeShop(), {
      initialTab: "visit",
      saveResponse: fieldErrorResponse([
        { field: "nameKana", type: "too_long" },
        { field: "googlePlaceId", type: "duplicate" },
      ]),
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    // Switched from 食べた記録 to 店舗情報, where the first invalid field is.
    const kana = await screen.findByRole("textbox", {
      description: "100文字以内で入力してください",
    });
    expect(kana).toHaveAttribute("aria-invalid", "true");
    expect(kana).toHaveFocus();
    expect(
      screen.getByRole("textbox", {
        description: "Google Place ID が他の店舗と重複しています",
      }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("店舗を更新できませんでした")).toBeNull();

    // Editing the field clears only its own error.
    await userEvent.type(kana, "あ");

    expect(screen.queryByText("100文字以内で入力してください")).toBeNull();
    expect(kana).not.toHaveAttribute("aria-invalid");
    expect(
      screen.getByText("Google Place ID が他の店舗と重複しています"),
    ).toBeInTheDocument();
  });

  it("switches to 店舗情報 for a 気になる度 error", async () => {
    renderEditor(makeShop({ eaten: false }), {
      initialTab: "visit",
      saveResponse: fieldErrorResponse([
        { field: "wishLevel", type: "invalid_format" },
      ]),
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByRole("combobox", {
        name: "気になる度",
        description: "形式が正しくありません",
      }),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("toasts an error that belongs to no field", async () => {
    const { onClose } = renderEditor(makeShop(), {
      saveResponse: () =>
        HttpResponse.json({ type: "internal_error" }, { status: 500 }),
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("店舗を更新できませんでした"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("treats a shop deleted elsewhere as deleted and closes", async () => {
    const target = makeShop();
    const { onClose, onDeleted } = renderEditor(target, {
      saveResponse: () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("この店舗はすでに削除されています"),
    ).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledWith(target.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("toasts a field error that has no input on screen", async () => {
    renderEditor(makeShop({ eaten: false }), {
      saveResponse: fieldErrorResponse([
        // Deprecated: the server derives the rate from visit logs, so no input.
        { field: "rate", type: "out_of_range" },
        // A field from a newer server.
        { field: "visitLogs", type: "required" } as unknown as {
          field: "name";
          type: "required";
        },
      ]),
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    // One toast per error.
    expect(await screen.findByText("範囲外の値です")).toBeInTheDocument();
    expect(await screen.findByText("入力してください")).toBeInTheDocument();
    expect(screen.getAllByText("店舗を更新できませんでした")).toHaveLength(2);
    // Stays on 店舗情報 rather than switching to an empty tab.
    expect(screen.getByText("読み（ひらがな）")).toBeInTheDocument();
  });

  it("cannot be cancelled while saving", async () => {
    let respond!: () => void;
    const responded = new Promise<void>((resolve) => (respond = resolve));
    const { onClose } = renderEditor(makeShop(), {
      saveResponse: async () => {
        await responded;
        return HttpResponse.json({ type: "internal_error" }, { status: 500 });
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    await waitFor(() => expect(cancel).toBeDisabled());
    respond();

    expect(
      await screen.findByText("店舗を更新できませんでした"),
    ).toBeInTheDocument();
    expect(cancel).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ShopEditModal links", () => {
  it("adds a link with the type inferred from the URL and saves it", async () => {
    const { requests } = renderEditor(
      makeShop({
        links: [{ type: "official", url: "https://aoba.example/" }],
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "＋ リンクを追加" }),
    );
    const row = screen.getByRole("group", { name: "リンク 2" });
    await userEvent.type(
      within(row).getByRole("textbox", { name: "URL" }),
      "https://www.instagram.com/aoba",
    );
    expect(within(row).getByRole("combobox", { name: "種類" })).toHaveValue(
      "instagram",
    );
    await userEvent.type(
      within(row).getByRole("textbox", { name: "表示名（任意）" }),
      "インスタ",
    );
    await userEvent.click(within(row).getByRole("button", { name: "上へ" }));
    // An empty row is dropped on save.
    await userEvent.click(
      screen.getByRole("button", { name: "＋ リンクを追加" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].links).toEqual([
      {
        type: "instagram",
        label: "インスタ",
        url: "https://www.instagram.com/aoba",
      },
      { type: "official", url: "https://aoba.example/" },
    ]);
  });

  it("keeps focus on a link moved with the arrows", async () => {
    renderEditor(
      makeShop({
        links: [
          { type: "official", url: "https://a.example/" },
          { type: "other", url: "https://b.example/" },
        ],
      }),
    );
    const row = (n: number) =>
      screen.getByRole("group", { name: `リンク ${n}` });

    await userEvent.click(within(row(2)).getByRole("button", { name: "上へ" }));

    // The moved link is now first; its 上へ is disabled, so focus is on 下へ.
    expect(within(row(1)).getByRole("textbox", { name: "URL" })).toHaveValue(
      "https://b.example/",
    );
    expect(within(row(1)).getByRole("button", { name: "下へ" })).toHaveFocus();

    await userEvent.click(within(row(1)).getByRole("button", { name: "下へ" }));

    expect(within(row(2)).getByRole("textbox", { name: "URL" })).toHaveValue(
      "https://b.example/",
    );
    expect(within(row(2)).getByRole("button", { name: "上へ" })).toHaveFocus();
  });

  it("blocks saving a link that has a label but no URL", async () => {
    const { requests } = renderEditor(makeShop());

    await userEvent.click(
      screen.getByRole("button", { name: "＋ リンクを追加" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "表示名（任意）" }),
      "公式",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("リンク 1 の URL が未入力です"),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("blocks saving an invalid URL and says which link", async () => {
    const { requests } = renderEditor(
      makeShop({
        links: [{ type: "official", url: "https://aoba.example/" }],
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "＋ リンクを追加" }),
    );
    await userEvent.type(
      within(screen.getByRole("group", { name: "リンク 2" })).getByRole(
        "textbox",
        { name: "URL" },
      ),
      "javascript:alert(1)",
    );
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("リンク 2 の URL が正しくありません"),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("shows a server links error under the links", async () => {
    renderEditor(makeShop(), {
      saveResponse: fieldErrorResponse([
        { field: "links", type: "invalid_format" },
      ]),
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText(/^リンクの内容を確認してください/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "＋ リンクを追加" }),
    );

    expect(screen.queryByText(/^リンクの内容を確認してください/)).toBeNull();
  });

  it("trims the Google Place ID it sends", async () => {
    const { requests } = renderEditor(makeShop({ googlePlaceId: "place-1" }));
    const input = screen.getByDisplayValue("place-1");

    await userEvent.clear(input);
    await userEvent.type(input, " place-2 ");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].googlePlaceId).toBe("place-2");
  });

  it("saves a shop that has no Google Place ID", async () => {
    const { requests, onClose } = renderEditor(
      makeShop({ name: "手入力の店", googlePlaceId: undefined }),
    );

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(requests[0]).toMatchObject({
      name: "手入力の店",
      googlePlaceId: "",
    });
  });

  it("sends a blank Google Place ID to clear an existing one", async () => {
    const { requests } = renderEditor(makeShop({ googlePlaceId: "place-1" }));

    await userEvent.clear(screen.getByDisplayValue("place-1"));
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].googlePlaceId).toBe("");
  });

  it("omits links for a shop cached without them so saving keeps them", async () => {
    const { requests } = renderEditor(makeShop({ links: undefined }));

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).not.toHaveProperty("links");
  });
});

describe("ShopEditModal 気になる度", () => {
  const wishSelect = () => screen.getByRole("combobox", { name: "気になる度" });

  it("omits 気になる度 when unchanged so the stored value is kept", async () => {
    const { requests } = renderEditor(
      makeShop({ eaten: false, wishLevel: "medium" }),
    );

    expect(wishSelect()).toHaveValue("medium");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).not.toHaveProperty("wishLevel");
    // 食べた and 評価 come from visit logs; the deprecated fields are not sent.
    expect(requests[0]).not.toHaveProperty("eaten");
    expect(requests[0]).not.toHaveProperty("rate");
  });

  it("sends the chosen 気になる度", async () => {
    const { requests } = renderEditor(makeShop({ eaten: false }));

    await userEvent.selectOptions(wishSelect(), "絶対行きたい");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].wishLevel).toBe("high");
  });

  it("sends an empty string to clear 気になる度", async () => {
    const { requests } = renderEditor(
      makeShop({ eaten: false, wishLevel: "high" }),
    );

    await userEvent.selectOptions(wishSelect(), "未設定");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].wishLevel).toBe("");
  });
});

describe("ShopEditModal 気になる度 across a refresh", () => {
  it("keeps omitting an untouched 気になる度 when the shop prop changes", async () => {
    const before = makeShop({ eaten: false, wishLevel: "medium" });
    const { requests, rerender } = renderEditor(before);

    // A refetch brings a newer 気になる度 while the modal is open.
    rerender({ ...before, wishLevel: "high" });
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).not.toHaveProperty("wishLevel");
  });
});

describe("ShopEditModal shop with visit logs", () => {
  it("disables 削除 and says why", () => {
    renderEditor(makeShop({ eaten: true, visitCount: 2 }));

    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
    expect(
      screen.getByText("訪問ログがある店舗は削除できません"),
    ).toBeInTheDocument();
  });
});
