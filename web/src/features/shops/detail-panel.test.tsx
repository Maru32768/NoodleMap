import {
  CurrentUser,
  CurrentUserProvider,
  GUEST_USER,
} from "@/features/auth/use-current-user.ts";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { DetailPanel } from "@/features/shops/detail-panel.tsx";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const admin: CurrentUser = {
  id: "00000000-0000-4000-8000-0000000000e5",
  email: "admin@example.com",
  type: "admin",
};

// jsdom ignores media queries, so the panel's `md: flex` never applies and
// its content stays display:none; queries opt into hidden elements.
const hidden = { hidden: true };

function renderPanel(shop: Shop, user: CurrentUser = GUEST_USER) {
  const onAdminEdit = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <CurrentUserProvider value={user}>
      <DetailPanel shop={shop} onAdminEdit={onAdminEdit} onClose={onClose} />
    </CurrentUserProvider>,
  );
  return { onAdminEdit, onClose };
}

describe("DetailPanel", () => {
  const shop = makeShop({
    name: "中華そば 青葉",
    address: "東京都中野区中野5-58-1",
    googlePlaceId: "place-123",
    openedAt: "1996-10-01",
    closedAt: "2999-03-31",
    tags: [makeTag({ label: "煮干し" })],
  });

  it("shows the shop details with a Google Maps link", () => {
    renderPanel(shop);

    expect(screen.getByText("中華そば 青葉")).toBeInTheDocument();
    expect(screen.getByText("1996/10/1")).toBeInTheDocument();
    expect(screen.getByText("2999/3/31")).toBeInTheDocument();
    expect(screen.getByText("閉店予定")).toBeInTheDocument();
    expect(screen.getByText(/Favorite/)).toBeInTheDocument();

    const mapsUrl = new URL(
      screen
        .getByRole("link", { ...hidden, name: /東京都中野区/ })
        .getAttribute("href")!,
    );
    expect(mapsUrl.searchParams.get("query")).toBe(
      "中華そば 青葉 東京都中野区中野5-58-1",
    );
    expect(mapsUrl.searchParams.get("query_place_id")).toBe("place-123");
  });

  it("hides user tags and editing from non-admins", () => {
    renderPanel(shop);

    expect(screen.queryByText("煮干し")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { ...hidden, name: "編集" }),
    ).not.toBeInTheDocument();
  });

  it("lets admins see user tags and open the editor", async () => {
    const { onAdminEdit } = renderPanel(shop, admin);

    expect(screen.getByText("煮干し")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { ...hidden, name: "編集" }),
      { pointerEventsCheck: 0 },
    );

    expect(onAdminEdit).toHaveBeenCalledWith(shop.id);
  });

  it("closes on Escape", async () => {
    const { onClose } = renderPanel(shop);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the favorite rating only for visited shops", () => {
    renderPanel(makeShop({ eaten: false, rate: 0 }));

    expect(screen.queryByText(/Favorite/)).not.toBeInTheDocument();
  });
});
