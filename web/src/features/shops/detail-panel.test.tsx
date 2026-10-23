import {
  CurrentUser,
  CurrentUserProvider,
  GUEST_USER,
} from "@/features/auth/use-current-user.ts";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { DetailPanel } from "@/features/shops/detail-panel.tsx";
import type { components } from "@/generated/api.ts";
import { makeShop, makeTag } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

type VisitLog = components["schemas"]["VisitLog"];

function serveVisits(visits: VisitLog[]) {
  server.use(
    http.get("/api/v1/shops/:id/visits", () => HttpResponse.json({ visits })),
  );
}

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
  beforeEach(() => serveVisits([]));

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
    expect(screen.getByText("お気に入り度 - Favorite")).toBeInTheDocument();

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

  it("shows http(s) shop links to guests in a new tab", () => {
    renderPanel(
      makeShop({
        links: [
          { type: "twitter", url: "https://x.com/aoba" },
          {
            type: "official",
            label: "本店サイト",
            url: "https://aoba.example/",
          },
          { type: "other", label: "悪い", url: "javascript:alert(1)" },
          // A type added by a newer server than this build.
          { type: "tiktok", url: "https://t.example/" } as never,
        ],
      }),
    );

    const links = screen.getAllByRole("link", {
      ...hidden,
      name: /Twitter|本店サイト|悪い|その他/,
    });
    expect(links.map((link) => link.textContent)).toEqual([
      "Twitter",
      "本店サイト",
      "その他",
    ]);
    expect(links[0]).toHaveAttribute("href", "https://x.com/aoba");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the お気に入り度 only for visited shops", () => {
    renderPanel(makeShop({ eaten: false, rate: 0 }));

    expect(
      screen.queryByText("お気に入り度 - Favorite"),
    ).not.toBeInTheDocument();
  });

  it("shows a not-eaten shop's 気になる度", () => {
    renderPanel(makeShop({ eaten: false, wishLevel: "high" }));
    expect(screen.getByText("絶対行きたい")).toBeInTheDocument();
  });

  it("shows plain 気になる for a not-eaten shop without 気になる度", () => {
    renderPanel(makeShop({ eaten: false }));
    expect(screen.getByText("気になる")).toBeInTheDocument();
  });
});

describe("DetailPanel visit logs", () => {
  const eaten = makeShop({ name: "麺屋 訪問", rate: 85, visitCount: 2 });
  const visits: VisitLog[] = [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      visitedOn: "2026-10-01",
      menuItems: [
        { name: "秋の限定つけ麺", isLimited: true, price: 1200 },
        { name: "替え玉", isLimited: false, price: 150 },
        { name: "味玉", isLimited: false },
      ],
      totalPrice: 1350,
      rate: 85,
      eventName: "大つけ麺博",
      publicNote: "スープが濃厚",
      images: [],
    },
    {
      id: "00000000-0000-4000-8000-0000000000a2",
      menuItems: [],
      images: [],
    },
  ];

  it("lists the visits with the visit count for a guest", async () => {
    serveVisits(visits);
    renderPanel(eaten);

    expect(screen.getByText("2回訪問")).toBeInTheDocument();
    const list = await screen.findByRole("list", {
      ...hidden,
      name: "訪問ログ",
    });
    const [first, second] = within(list).getAllByRole("listitem", hidden);
    expect(first).toHaveTextContent("2026/10/1");
    // Each 食べたメニュー with its own 限定 badge and price, then the 合計.
    expect(first).toHaveTextContent(
      "秋の限定つけ麺限定¥1,200替え玉¥150味玉合計¥1,350",
    );
    expect(within(first).getAllByText("限定")).toHaveLength(1);
    expect(first).toHaveTextContent("大つけ麺博");
    expect(first).toHaveTextContent("スープが濃厚");
    expect(first).not.toHaveTextContent("メモ（自分用）");
    expect(second).toHaveTextContent("日付不明");
    expect(second).toHaveTextContent("お気に入り度 未設定");
    expect(second).not.toHaveTextContent("合計");
  });

  it("shows メモ（自分用） when the API returns it (admin)", async () => {
    serveVisits([{ ...visits[0], privateNote: "次は味玉" }]);
    renderPanel(eaten, admin);

    const list = await screen.findByRole("list", {
      ...hidden,
      name: "訪問ログ",
    });
    expect(within(list).getByText("メモ（自分用）")).toBeInTheDocument();
    expect(within(list).getByText("次は味玉")).toBeInTheDocument();
  });

  it("says when the visit list is empty", async () => {
    serveVisits([]);
    renderPanel(eaten);

    expect(
      await screen.findByText("まだ訪問ログがありません"),
    ).toBeInTheDocument();
  });

  it("shows 未設定 instead of a 0 お気に入り度 when no visit has one", async () => {
    serveVisits([visits[1]]);
    renderPanel(makeShop({ eaten: true, rate: 0, visitCount: 1 }));

    await screen.findByRole("list", { ...hidden, name: "訪問ログ" });
    expect(screen.getByText("未設定")).toBeInTheDocument();
    expect(screen.getByText("お気に入り度 未設定")).toBeInTheDocument();
    expect(screen.queryByText("/ 100")).not.toBeInTheDocument();
  });

  it("offers 再試行 when the visits fail to load", async () => {
    let fail = true;
    server.use(
      http.get("/api/v1/shops/:id/visits", () =>
        fail
          ? HttpResponse.json({ type: "internal_error" }, { status: 500 })
          : HttpResponse.json({ visits }),
      ),
    );
    renderPanel(eaten);

    expect(
      await screen.findByText("訪問ログを読み込めませんでした", undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(
      screen.getByRole("button", { ...hidden, name: "再試行" }),
      { pointerEventsCheck: 0 },
    );

    expect(
      await screen.findByRole("list", { ...hidden, name: "訪問ログ" }),
    ).toHaveTextContent("秋の限定つけ麺");
  });
});

describe("DetailPanel images", () => {
  const image = {
    id: "00000000-0000-4000-8000-0000000000c1",
    url: "https://img.example.test/1.jpg",
    width: 2048,
    height: 1536,
    caption: "特製中華そば",
  };

  it("shows the shop's 代表写真 at the top", () => {
    serveVisits([]);
    renderPanel(
      makeShop({ name: "麺屋 写真", coverPhotoUrl: image.url, eaten: false }),
    );

    expect(
      screen.getByRole("img", { ...hidden, name: "麺屋 写真の代表写真" }),
    ).toHaveAttribute("src", image.url);
  });

  it("loads the 代表写真 eagerly and falls back to the category art when it breaks", () => {
    serveVisits([]);
    renderPanel(
      makeShop({ name: "麺屋 壊れ", coverPhotoUrl: image.url, eaten: false }),
    );
    const cover = screen.getByRole("img", {
      ...hidden,
      name: "麺屋 壊れの代表写真",
    });
    expect(cover).toHaveAttribute("loading", "eager");

    fireEvent.error(cover);

    expect(
      screen.queryByRole("img", { ...hidden, name: "麺屋 壊れの代表写真" }),
    ).toBeNull();
  });

  it("shows no photo for a shop without one", () => {
    serveVisits([]);
    renderPanel(makeShop({ name: "麺屋 写真なし", eaten: false }));

    expect(
      screen.queryByRole("img", { ...hidden, name: /代表写真/ }),
    ).toBeNull();
  });

  it("shows each visit's images; Esc closes the lightbox, not the panel", async () => {
    serveVisits([
      {
        id: "00000000-0000-4000-8000-0000000000a1",
        menuItems: [],
        images: [image],
      },
    ]);
    const { onClose } = renderPanel(makeShop({ coverPhotoUrl: image.url }));

    const images = await screen.findByRole("list", {
      ...hidden,
      name: "訪問画像",
    });
    await userEvent.click(
      within(images).getByRole("button", {
        ...hidden,
        name: "画像 1 / 1: 特製中華そばを拡大",
      }),
      { pointerEventsCheck: 0 },
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent("特製中華そば");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });
});
