import type { Page } from "@playwright/test";
import { expect, test, uid } from "../../support/fixtures.ts";
import { DATELESS_SHOP, NEAR_SHOP, PHOTO_FIXTURES, photoFixturePath } from "../../support/photo-fixtures.ts";

const PHOTOS = PHOTO_FIXTURES.map((photo) => photoFixturePath(photo.name));

async function selectPhotos(page: Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "写真から取り込み" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "写真から取り込み" });
  await dialog.getByLabel("写真を選ぶ").setInputFiles(PHOTOS);
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
