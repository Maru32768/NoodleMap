import type { FindResult } from "@/features/map/google-place-finder.tsx";
import { PhotoImportModal } from "@/features/photo-import/photo-import-modal.tsx";
import { Shop, useShops } from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";
import { ExifSpec, withExif } from "@/test/exif-jpeg.ts";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { server } from "@/test/server.ts";
import { fakeVisitServer } from "@/test/visit-server.ts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Alone in its block, so its photos auto-pick it.
const ALONE = makeShop({ name: "麺屋 ひとり", lat: 35.7, lng: 139.7 });
// Two shops about 11 m apart: their photos always need the admin.
const NEIGHBOR_A = makeShop({ name: "中華そば 甲", lat: 35.68, lng: 139.76 });
const NEIGHBOR_B = makeShop({ name: "らーめん 乙", lat: 35.6801, lng: 139.76 });
const SHOPS = [ALONE, NEIGHBOR_A, NEIGHBOR_B];

const BARE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const photo = (name: string, at: string, lat: number, lng: number) =>
  new File(
    [
      withExif(BARE_JPEG, {
        dateTimeOriginal: at,
        offsetTimeOriginal: "+09:00",
        gps: { lat, lng },
      } satisfies ExifSpec),
    ],
    name,
    { type: "image/jpeg" },
  );

const PHOTOS = [
  photo("alone-1.jpg", "2023:04:01 12:00:00", 35.7, 139.7),
  photo("alone-2.jpg", "2023:04:01 12:05:00", 35.7, 139.7),
  photo("neighbors.jpg", "2023:04:02 19:00:00", 35.68, 139.76),
  photo("far.jpg", "2023:04:03 09:00:00", 35.6, 139.6),
];

function renderModal() {
  const onClose = vi.fn();
  const onShopsChanged = vi.fn();
  renderWithProviders(
    <VirtuosoMockContext.Provider
      value={{ viewportHeight: 2000, itemHeight: 200 }}
    >
      <PhotoImportModal
        shops={SHOPS}
        open
        onClose={onClose}
        onShopsChanged={onShopsChanged}
      />
    </VirtuosoMockContext.Provider>,
  );
  return { onClose, onShopsChanged };
}

// Stands in for GooglePlaceFinder, whose WebGL map cannot render in jsdom: offers one place where it was opened.
function StubPlaceFinder({
  onSelect,
  near,
}: {
  onSelect: (res: FindResult) => void;
  near?: { lat: number; lng: number };
}) {
  return (
    <button
      type="button"
      disabled={!near}
      onClick={() =>
        onSelect({
          placeId: "new-place",
          name: "麺処 しんき",
          address: "東京都世田谷区",
          postalCode: "",
          lat: near!.lat,
          lng: near!.lng,
          closed: false,
        })
      }
    >
      {near?.lat.toFixed(4)},{near?.lng.toFixed(4)} の店を選ぶ
    </button>
  );
}

// Like the admin page: shops come from useShops, whose list a saved shop joins.
function LiveShopsModal() {
  const { shops } = useShops();
  return shops ? (
    <PhotoImportModal
      shops={shops}
      open
      onClose={() => {}}
      onShopsChanged={() => {}}
      PlaceFinder={StubPlaceFinder}
    />
  ) : null;
}

async function selectPhotos(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(await screen.findByLabelText("写真を選ぶ"), PHOTOS);
  await screen.findByText(/件の訪問を作成/);
}

describe("PhotoImportModal", () => {
  // jsdom has no object URLs; thumbnails need one per photo.
  beforeEach(() => {
    URL.createObjectURL = () => "blob:thumbnail";
    URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("asks about a photo between two shops, then imports what was decided", async () => {
    const user = userEvent.setup();
    const fake = fakeVisitServer();
    const { onClose, onShopsChanged } = renderModal();

    await selectPhotos(user);

    expect(
      screen.getByText(
        "1 件の訪問を作成 / 0 件の日付不明ログに日付を付ける / 0 件に画像を追加 / 0 件は取り込み済み / 要確認 1 件は取り込まれません",
      ),
    ).toBeInTheDocument();
    const candidates = await screen.findByRole("radiogroup", {
      name: "店舗の候補",
    });
    expect(
      within(candidates)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["中華そば 甲 0m", "らーめん 乙 11m"]);

    await user.click(
      within(candidates).getByRole("radio", { name: /中華そば 甲/ }),
    );
    await screen.findByText(/^2 件の訪問を作成/);
    await user.click(screen.getByRole("button", { name: "取り込む" }));

    await screen.findByText("取り込みが完了しました");
    // The admin's pick runs first; the far photo never becomes a visit.
    expect(fake.log).toEqual([
      "create 2023-04-02",
      "image 1",
      "create 2023-04-01",
      "image 1",
      "image 2",
    ]);
    expect(fake.visitsOf(NEIGHBOR_A.id)).toHaveLength(1);
    expect(fake.visitsOf(ALONE.id)).toHaveLength(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onShopsChanged).toHaveBeenCalledTimes(1);
  });

  it("shows a photo far from every shop as skipped and leaves a photo out when excluded", async () => {
    const user = userEvent.setup();
    const fake = fakeVisitServer();
    renderModal();
    await selectPhotos(user);

    await user.click(screen.getByRole("radio", { name: "スキップ (1)" }));
    expect(screen.getAllByRole("group", { name: /2023-04-03/ })).toHaveLength(
      1,
    );

    await user.click(screen.getByRole("radio", { name: /取り込み予定/ }));
    const alone = screen.getByRole("group", { name: /2023-04-01/ });
    await user.click(
      within(alone).getByRole("button", { name: "写真2を取り込む" }),
    );
    expect(
      within(alone).getByRole("button", { name: "写真2を取り込む" }),
    ).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "取り込む" }));

    await screen.findByText("取り込みが完了しました");
    expect(fake.log).toEqual(["create 2023-04-01", "image 1"]);
  });

  it("adds the shop of a photo far from every shop, at the photo's position, and imports to it", async () => {
    const user = userEvent.setup();
    const fake = fakeVisitServer();
    const added: components["schemas"]["AddShopRequest"][] = [];
    const created: Shop[] = [];
    server.use(
      http.get("/api/v1/shops", () => HttpResponse.json({ shops: SHOPS })),
      http.get("/api/v1/tags", () => HttpResponse.json({ tags: [] })),
      http.post("/api/v1/auth/shops", async ({ request }) => {
        const body = (await request.json()) as (typeof added)[number];
        added.push(body);
        const shop = makeShop({
          name: body.name,
          lat: body.lat,
          lng: body.lng,
          eaten: false,
        });
        created.push(shop);
        return HttpResponse.json(shop);
      }),
    );
    renderWithProviders(
      <VirtuosoMockContext.Provider
        value={{ viewportHeight: 2000, itemHeight: 200 }}
      >
        <LiveShopsModal />
      </VirtuosoMockContext.Provider>,
    );
    await selectPhotos(user);

    await user.click(screen.getByRole("radio", { name: "スキップ (1)" }));
    const far = screen.getByRole("group", { name: /2023-04-03/ });
    await user.click(
      within(far).getByRole("button", { name: "この場所の店を追加" }),
    );

    // The dialogs have no accessible name; the add form is the one under its title.
    const addDialog = (await screen.findByText("新しい店舗を追加")).closest(
      "[role=dialog]",
    ) as HTMLElement;
    await user.click(
      within(addDialog).getByRole("button", {
        name: "35.6000,139.6000 の店を選ぶ",
      }),
    );
    await user.click(within(addDialog).getByRole("button", { name: "追加" }));

    await waitFor(() =>
      expect(screen.queryByText("新しい店舗を追加")).toBeNull(),
    );
    expect(added).toMatchObject([
      {
        name: "麺処 しんき",
        // EXIF stores GPS as rationals, so the photo's position comes back within a hair.
        lat: expect.closeTo(35.6, 6),
        lng: expect.closeTo(139.6, 6),
      },
    ]);
    await screen.findByText(/^2 件の訪問を作成/);
    await user.click(screen.getByRole("button", { name: "取り込む" }));

    await screen.findByText("取り込みが完了しました");
    expect(fake.visitsOf(created[0].id)).toMatchObject([
      { visitedOn: "2023-04-03" },
    ]);
  });

  it("refuses to close while the import runs", async () => {
    const user = userEvent.setup();
    fakeVisitServer();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post("/api/v1/auth/shops/:id/visits", async () => {
        await held;
        return undefined;
      }),
    );
    const { onClose } = renderModal();
    await selectPhotos(user);

    await user.click(screen.getByRole("button", { name: "取り込む" }));
    await screen.findByRole("button", { name: "停止" });
    await user.keyboard("{Escape}");
    await delay(50);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    release();
    await screen.findByText("取り込みが完了しました");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "停止" })).toBeNull(),
    );
  });
});
