import { toaster } from "@/components/ui/toaster.tsx";
import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

const shop = makeShop({ name: "中華そば 青葉" });

function renderModal(deleteResponse: () => Response) {
  server.use(
    http.get("/api/v1/shops", () => HttpResponse.json({ shops: [shop] })),
    http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
    http.delete(`/api/v1/auth/shops/${shop.id}`, deleteResponse),
  );
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  renderWithProviders(
    <ShopEditModal
      shop={shop}
      open
      onClose={onClose}
      onSave={() => Promise.resolve()}
      onDeleted={onDeleted}
    />,
  );
  return { onClose, onDeleted };
}

async function confirmDelete() {
  await userEvent.click(screen.getByRole("button", { name: "削除" }));
  const dialog = await screen.findByText(
    "「中華そば 青葉」を削除しますか？この操作は取り消せません。",
  );
  const confirm = dialog.closest<HTMLElement>("[role=dialog]")!;
  await userEvent.click(within(confirm).getByRole("button", { name: "削除" }));
}

describe("ShopEditModal delete", () => {
  // The toaster store is global; clear it so one test's toast never leaks into the next.
  afterEach(() => toaster.remove());

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

describe("ShopEditModal links", () => {
  it("adds a link with the type inferred from the URL and saves it", async () => {
    server.use(http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })));
    const onSave = vi.fn(() => Promise.resolve());
    renderWithProviders(
      <ShopEditModal
        shop={makeShop({
          links: [{ type: "official", url: "https://aoba.example/" }],
        })}
        open
        onClose={vi.fn()}
        onSave={onSave}
        onDeleted={vi.fn()}
      />,
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

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        links: [
          {
            type: "instagram",
            label: "インスタ",
            url: "https://www.instagram.com/aoba",
          },
          { type: "official", url: "https://aoba.example/" },
        ],
      }),
    );
  });

  it("keeps focus on a link moved with the arrows", async () => {
    server.use(http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })));
    renderWithProviders(
      <ShopEditModal
        shop={makeShop({
          links: [
            { type: "official", url: "https://a.example/" },
            { type: "other", url: "https://b.example/" },
          ],
        })}
        open
        onClose={vi.fn()}
        onSave={vi.fn(() => Promise.resolve())}
        onDeleted={vi.fn()}
      />,
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
    server.use(http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })));
    const onSave = vi.fn(() => Promise.resolve());
    renderWithProviders(
      <ShopEditModal
        shop={makeShop()}
        open
        onClose={vi.fn()}
        onSave={onSave}
        onDeleted={vi.fn()}
      />,
    );

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
    expect(onSave).not.toHaveBeenCalled();
    toaster.remove();
  });

  it("blocks saving an invalid URL and says which link", async () => {
    server.use(http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })));
    const onSave = vi.fn(() => Promise.resolve());
    renderWithProviders(
      <ShopEditModal
        shop={makeShop({
          links: [{ type: "official", url: "https://aoba.example/" }],
        })}
        open
        onClose={vi.fn()}
        onSave={onSave}
        onDeleted={vi.fn()}
      />,
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
    expect(onSave).not.toHaveBeenCalled();
    toaster.remove();
  });

  it("omits links for a shop cached without them so saving keeps them", async () => {
    server.use(http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })));
    const onSave = vi.fn(() => Promise.resolve());
    renderWithProviders(
      <ShopEditModal
        shop={makeShop({ links: undefined })}
        open
        onClose={vi.fn()}
        onSave={onSave}
        onDeleted={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ links: undefined }),
    );
  });
});
