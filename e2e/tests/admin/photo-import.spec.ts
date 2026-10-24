import type { Page } from "@playwright/test";
import { expect, test, uid } from "../../support/fixtures.ts";
import {
  DATELESS_SHOP,
  NEAR_SHOP,
  PHOTO_FIXTURES,
  photoFixturePath,
  UNREGISTERED_SHOP,
} from "../../support/photo-fixtures.ts";

const UNREGISTERED_PHOTO = "photo-unregistered.jpg";
const PHOTOS = PHOTO_FIXTURES.filter((photo) => photo.name !== UNREGISTERED_PHOTO).map((photo) =>
  photoFixturePath(photo.name),
);

async function selectPhotos(page: Page, photos = PHOTOS) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "写真から取り込み" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "写真から取り込み" });
  await dialog.getByLabel("写真を選ぶ").setInputFiles(photos);
  return dialog;
}

test("imports nearby photos as one dated visit, dates a dateless visit, and changes nothing when run again", async ({
  page,
  api,
}) => {
  const id = uid();
  const near = await api.createShop({ name: `${id} 写真の店`, ...NEAR_SHOP });
  const dateless = await api.createShop({ name: `${id} 日付不明の店`, ...DATELESS_SHOP, eaten: true, rate: 72 });
  const visitCounts = async () => new Map((await api.listShops()).map((s) => [s.id, s.visitCount]));
  const before = await visitCounts();

  const dialog = await selectPhotos(page);
  await expect(
    dialog.getByText(
      "1 件の訪問を作成 / 1 件の日付不明ログに日付を付ける / 0 件に画像を追加 / 0 件は取り込み済み / 要確認 0 件は取り込まれません",
    ),
  ).toBeVisible();
  // The photo 4 km from every shop is skipped, never a visit.
  await dialog.getByRole("radio", { name: "スキップ (1)" }).click();
  await expect(dialog.getByRole("group", { name: /^2023-05-12 / })).toBeVisible();
  await dialog.getByRole("button", { name: "取り込む", exact: true }).click();
  await expect(dialog.getByText("取り込みが完了しました")).toBeVisible();

  const [nearVisit, ...moreNear] = await api.listVisits(near.id);
  expect(moreNear).toEqual([]);
  expect(nearVisit).toMatchObject({ visitedOn: "2023-05-10" });
  expect(nearVisit.images).toHaveLength(2);
  const [claimed, ...moreDateless] = await api.listVisits(dateless.id);
  expect(moreDateless).toEqual([]);
  expect(claimed).toMatchObject({ visitedOn: "2023-05-11", rate: 72 });
  expect(claimed.images).toHaveLength(1);
  const after = await visitCounts();
  expect(after).toEqual(new Map([...before, [near.id, 1]]));

  // Run it again from scratch: the same photos are recognized as imported and nothing is sent.
  await page.reload();
  const again = await selectPhotos(page);
  await expect(
    again.getByText(
      "0 件の訪問を作成 / 0 件の日付不明ログに日付を付ける / 0 件に画像を追加 / 2 件は取り込み済み / 要確認 0 件は取り込まれません",
    ),
  ).toBeVisible();
  await expect(again.getByRole("radio", { name: "取り込み済み (2)" })).toBeVisible();
  await expect(again.getByRole("button", { name: "取り込む", exact: true })).toBeDisabled();
  expect(await visitCounts()).toEqual(after);
  expect((await api.listVisits(near.id)).map((v) => v.images.length)).toEqual([2]);
  expect((await api.listVisits(dateless.id)).map((v) => v.images.length)).toEqual([1]);
});

test("adds the unregistered shop of a photo where it was taken, then imports the photo to it", async ({ page, api }) => {
  const name = `${uid()} 写真で見つけた店`;
  const dialog = await selectPhotos(page, [photoFixturePath(UNREGISTERED_PHOTO)]);
  await dialog.getByRole("radio", { name: "スキップ (1)" }).click();
  await dialog
    .getByRole("group", { name: /^2023-05-13 / })
    .getByRole("button", { name: "この場所の店を追加" })
    .click();

  const add = page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" });
  // EXIF stores GPS as rationals, so the photo's position comes back within a hair.
  const atPhoto = (lat: unknown, lng: unknown) => {
    expect(Number(lat)).toBeCloseTo(UNREGISTERED_SHOP.lat, 6);
    expect(Number(lng)).toBeCloseTo(UNREGISTERED_SHOP.lng, 6);
  };
  atPhoto(
    await add.locator('label:has-text("緯度") + input').inputValue(),
    await add.locator('label:has-text("経度") + input').inputValue(),
  );
  // The search is biased to the photo; with no Places key the backend answers 503 and the form stays manual.
  const autocomplete = page.waitForRequest("**/api/v1/auth/google-places/autocomplete?*");
  await add.getByRole("combobox", { name: "Google Place を検索" }).fill("ラーメン");
  const params = new URL((await autocomplete).url()).searchParams;
  atPhoto(params.get("lat"), params.get("lng"));
  await expect(add.getByText("Google Place 検索を利用できません。店舗情報はフォームに直接入力できます。")).toBeVisible();
  await add.locator('label:has-text("店名") + input').fill(name);
  await add.getByRole("button", { name: "追加", exact: true }).click();
  await expect(add).toBeHidden();

  await expect(
    dialog.getByText(
      "1 件の訪問を作成 / 0 件の日付不明ログに日付を付ける / 0 件に画像を追加 / 0 件は取り込み済み / 要確認 0 件は取り込まれません",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "取り込む", exact: true }).click();
  await expect(dialog.getByText("取り込みが完了しました")).toBeVisible();

  const shop = (await api.listShops()).find((s) => s.name === name);
  if (!shop) throw new Error("the added shop is not listed");
  atPhoto(shop.lat, shop.lng);
  const [visit, ...more] = await api.listVisits(shop.id);
  expect(more).toEqual([]);
  expect(visit).toMatchObject({ visitedOn: "2023-05-13" });
  expect(visit.images).toHaveLength(1);
});
