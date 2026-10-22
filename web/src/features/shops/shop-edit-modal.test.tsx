import { ShopEditModal } from "@/features/shops/shop-edit-modal.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

const shop = makeShop({ name: "中華そば 青葉" });

function renderModal() {
  const onClose = vi.fn();
  renderWithProviders(
    <ShopEditModal
      shop={shop}
      open
      onClose={onClose}
      onSave={() => Promise.resolve()}
    />,
  );
  return { onClose };
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
  it("deletes the shop after confirmation and closes", async () => {
    let deletedId: string | undefined;
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: [shop] })),
      http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
      http.delete("/api/v1/auth/shops/:id", ({ params }) => {
        deletedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onClose } = renderModal();

    await confirmDelete();

    expect(await screen.findByText("店舗を削除しました")).toBeInTheDocument();
    expect(deletedId).toBe(shop.id);
    expect(onClose).toHaveBeenCalled();
  });

  it("toasts the API error and stays open when deletion fails", async () => {
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: [shop] })),
      http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
      http.delete("/api/v1/auth/shops/:id", () =>
        HttpResponse.json({ type: "not_found" }, { status: 404 }),
      ),
    );
    const { onClose } = renderModal();

    await confirmDelete();

    expect(
      await screen.findByText("対象のデータが見つかりません"),
    ).toBeInTheDocument();
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });
});
