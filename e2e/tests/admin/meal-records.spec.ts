import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, uid } from "../../support/fixtures.ts";

// A 320 x 240 JPEG of a few KB.
const MEAL_RECORD_IMAGE = fileURLToPath(new URL("../../fixtures/meal-record-image.jpg", import.meta.url));

test("collaboration records share photos and a reusable venue and can be detached and deleted from either shop", async ({ page, api, asGuest }) => {
  const id = uid();
  const a = await api.createShop({ name: `${id} コラボA` });
  const b = await api.createShop({ name: `${id} コラボB` });
  const venueName = `${id} ラーメンWalkerキッチン`;
  const privateNote = `${id} 非公開の感想`;
  let dialog = await openEditModal(page, a.name, id);
  await dialog.getByRole("button", { name: "食べた記録", exact: true }).click();
  await dialog.getByRole("button", { name: "食べた記録を追加" }).click();
  let form = dialog.getByRole("group", { name: "食べた記録を追加", exact: true });
  await form.getByRole("combobox", { name: "提供した店舗" }).fill(b.name);
  await page.getByRole("option", { name: b.name, exact: true }).click();
  await form.getByLabel("催事・出店先", { exact: true }).fill(venueName);
  await form.getByRole("textbox", { name: "メニュー名" }).fill("A×B 限定そば");
  await form.getByRole("spinbutton", { name: "お気に入り度" }).fill("90");
  await form.getByRole("textbox", { name: "メモ（自分用）" }).fill(privateNote);
  await form.getByRole("combobox", { name: "提供した店舗" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/collaboration-form.png", fullPage: true });
  await form.getByRole("button", { name: "食べた記録を保存" }).click();
  await expect(dialog.getByRole("list", { name: "食べた記録" })).toContainText("A×B 限定そば");
  const shared = (await api.listMealRecords(a.id))[0];
  expect(shared.shops.map((shop) => shop.id)).toEqual([a.id, b.id]);
  expect((await api.listMealRecords(b.id))[0].id).toBe(shared.id);
  const venue = shared.venue!;
  const entry = dialog.getByRole("list", { name: "食べた記録" }).getByRole("listitem");
  await entry.locator('input[type="file"]').setInputFiles(MEAL_RECORD_IMAGE);
  await expect(entry.getByRole("list", { name: "記録の画像" }).getByRole("listitem")).toHaveCount(1);
  await expect.poll(async () => (await api.getShop(a.id)).coverPhotoUrl).toBeTruthy();
  const cover = (await api.getShop(a.id)).coverPhotoUrl;
  expect((await api.getShop(b.id)).coverPhotoUrl).toBe(cover);
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();

  dialog = await openEditModal(page, b.name, id);
  await dialog.getByRole("button", { name: "食べた記録", exact: true }).click();
  await dialog.getByRole("button", { name: "食べた記録を追加" }).click();
  form = dialog.getByRole("group", { name: "食べた記録を追加", exact: true });
  await expect(form.locator(`datalist option[value="${venueName}"]`)).toHaveCount(1);
  await form.getByLabel("催事・出店先", { exact: true }).fill(venueName);
  await form.getByRole("textbox", { name: "メニュー名" }).fill("B 単独そば");
  await form.getByRole("button", { name: "食べた記録を保存" }).click();
  await expect(dialog.getByRole("list", { name: "食べた記録" }).locator(":scope > li")).toHaveCount(2);
  expect((await api.listMealRecords(b.id)).every((mealRecord) => mealRecord.venue?.id === venue.id)).toBe(true);

  await asGuest(async (guestPage) => {
    await guestPage.goto(`/search?shop=${a.id}`);
    await guestPage.locator("#root").getByRole("link", { name: venueName, exact: true }).filter({ visible: true }).click();
    await expect(guestPage.getByRole("heading", { name: venueName, exact: true })).toBeVisible();
    const list = guestPage.getByRole("list", { name: "食べた記録", exact: true });
    await expect(list.getByRole("listitem").filter({ hasText: "限定そば" })).toHaveCount(1);
    await expect(list).toContainText("B 単独そば");
    await expect(list).not.toContainText(privateNote);
    await expect(list.getByRole("link", { name: a.name, exact: true })).toBeVisible();
    await expect(list.getByRole("list", { name: "記録の画像" })).toBeVisible();
    const json = await guestPage.request.get(`/api/v1/venues/${venue.id}/meal-records`);
    expect(await json.text()).not.toContain("privateNote");
    await guestPage.screenshot({ path: "test-results/venue-history.png", fullPage: true });
  });

  const sharedEntry = dialog.getByRole("listitem").filter({ hasText: "A×B 限定そば" });
  await sharedEntry.getByRole("button", { name: "食べた記録を編集" }).click();
  const edit = dialog.getByRole("group", { name: "食べた記録を編集", exact: true });
  await edit.getByRole("button", { name: `Remove ${a.name}`, exact: true }).click();
  await edit.getByRole("textbox", { name: "メモ（公開）" }).fill("Bから編集");
  await edit.getByRole("button", { name: "食べた記録を保存" }).click();
  await expect(dialog.getByText("Bから編集")).toBeVisible();
  expect(await api.listMealRecords(a.id)).toEqual([]);
  expect((await api.getShop(a.id)).coverPhotoUrl).toBeUndefined();
  const kept = (await api.listMealRecords(b.id)).find((mealRecord) => mealRecord.id === shared.id)!;
  expect(kept.shops.map((shop) => shop.id)).toEqual([b.id]);
  expect(kept.images).toHaveLength(1);
  const deletedPhoto = await page.request.delete(`/api/v1/auth/meal-record-images/${kept.images[0].id}`);
  expect(deletedPhoto.ok()).toBe(true);
  expect((await api.getShop(b.id)).coverPhotoUrl).toBeUndefined();
  await sharedEntry.getByRole("button", { name: "食べた記録を削除" }).click();
  const confirm = page.getByRole("dialog").filter({ hasText: "紐づいているすべての店舗から" });
  await confirm.getByRole("button", { name: "削除", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "食べた記録" }).locator(":scope > li")).toHaveCount(1);
  const history = await page.request.get(`/api/v1/venues/${venue.id}/meal-records`);
  expect((await history.json()).mealRecords.map((mealRecord: { id: string }) => mealRecord.id)).not.toContain(shared.id);
});

async function openEditModal(page: Page, name: string, filter: string) {
  await page.goto("/admin");
  await page.getByPlaceholder("店名・読み・住所・タグで絞り込み...").filter({ visible: true }).fill(filter);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "編集" }).click();
  return page.getByRole("dialog").filter({ hasText: name });
}

test("admin records a meal record of two menu items that guests see without its private note", async ({ page, api, asGuest }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 食べた記録を追加する店` });
  const publicNote = `${id} 公開メモ`;
  const privateNote = `${id} 自分用メモ`;

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "食べた記録", exact: true }).click();
  await dialog.getByRole("button", { name: "食べた記録を追加" }).click();
  const form = dialog.getByRole("group", { name: "食べた記録を追加" });
  // 連食: two 食べたメニュー in one meal record, the second one 限定.
  const firstItem = form.getByRole("group", { name: "メニュー 1" });
  await firstItem.getByRole("textbox", { name: "メニュー名" }).fill("特製中華そば");
  await firstItem.getByRole("spinbutton", { name: "価格" }).fill("1200");
  await form.getByRole("button", { name: "＋ メニューを追加" }).click();
  const secondItem = form.getByRole("group", { name: "メニュー 2" });
  await secondItem.getByRole("textbox", { name: "メニュー名" }).fill("限定煮干しつけ麺");
  await secondItem.getByText("限定", { exact: true }).click();
  await secondItem.getByRole("spinbutton", { name: "価格" }).fill("1300");
  await expect(form).toContainText("合計 ¥2,500");
  await form.getByRole("spinbutton", { name: "お気に入り度" }).fill("85");
  await form.getByRole("textbox", { name: "メモ（公開）" }).fill(publicNote);
  await form.getByRole("textbox", { name: "メモ（自分用）" }).fill(privateNote);
  await form.getByRole("button", { name: "食べた記録を保存" }).click();

  await expect(page.getByText("食べた記録を保存しました")).toBeVisible();
  const entry = dialog.getByRole("list", { name: "食べた記録" }).getByRole("listitem");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("特製中華そば¥1,200限定煮干しつけ麺限定¥1,300合計¥2,500");
  await expect(entry).toContainText(privateNote);
  expect(await api.getShop(shop.id)).toMatchObject({ eaten: true, rate: 85, favorite: true, mealRecordCount: 1 });
  // The shop list was refreshed: 削除 is locked and, once the modal is closed,
  // the row counts the mealRecord.
  await expect(dialog.getByRole("button", { name: "削除", exact: true })).toBeDisabled();
  await expect(dialog.getByText("食べた記録がある店舗は削除できません")).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: shop.name })).toContainText("1件");

  await asGuest(async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await expect(guestPage.getByText("お気に入り度 - Favorite")).toBeVisible();
    await expect(guestPage.locator("#root").getByText("1件の記録")).toBeVisible();
    const mealRecords = guestPage.getByRole("list", { name: "食べた記録" }).filter({ visible: true });
    await expect(mealRecords).toContainText(publicNote);
    await expect(mealRecords).toContainText("85");
    await expect(mealRecords).toContainText("特製中華そば¥1,200限定煮干しつけ麺限定¥1,300合計¥2,500");
    await expect(mealRecords).not.toContainText(privateNote);
    await expect(guestPage.getByText(privateNote)).toHaveCount(0);
  });
});

test("deleting a shop's only meal record returns it to 気になる", async ({ page, api, asGuest }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 訪問を消す店`, eaten: true, rate: 85 });

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "食べた記録", exact: true }).click();
  await dialog.getByRole("button", { name: "食べた記録を削除" }).click();
  const confirm = page.getByRole("dialog").filter({ hasText: "の食べた記録を削除しますか？" });
  await confirm.getByRole("button", { name: "削除", exact: true }).click();

  await expect(page.getByText("食べた記録を削除しました")).toBeVisible();
  await expect(dialog.getByText("まだ食べた記録がありません")).toBeVisible();
  expect(await api.getShop(shop.id)).toMatchObject({ eaten: false, favorite: false, mealRecordCount: 0 });
  await expect(dialog.getByRole("button", { name: "削除", exact: true })).toBeEnabled();

  await asGuest(async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await expect(guestPage.locator("#root").getByRole("button", { name: "閉じる" })).toBeVisible();
    await expect(guestPage.getByText("お気に入り度 - Favorite")).toHaveCount(0);
    await expect(guestPage.getByRole("list", { name: "食べた記録" })).toHaveCount(0);
  });
});

test("admin adds a meal record image that guests see in the meal record and as the 代表写真", async ({
  page,
  api,
  asGuest,
}) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 写真のある店`, eaten: true, rate: 80 });
  const caption = `${id} 特製中華そば`;

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "食べた記録", exact: true }).click();
  await dialog.getByLabel("追加する画像ファイル").setInputFiles(MEAL_RECORD_IMAGE);

  const images = dialog.getByRole("list", { name: "記録の画像" });
  await expect(images.getByRole("listitem")).toHaveCount(1);
  await expect(images.getByText("代表")).toBeVisible();
  // The stored JPEG loads (320 x 240, under the server's 2048 px limit).
  await expect(images.getByRole("img", { name: "画像 1" })).toHaveJSProperty("naturalWidth", 320);
  await images.getByRole("button", { name: "画像 1 のキャプションを編集" }).click();
  await images.getByRole("textbox", { name: "キャプション" }).fill(caption);
  await images.getByRole("button", { name: "保存", exact: true }).click();
  await expect(images.getByText(caption)).toBeVisible();
  expect((await api.getShop(shop.id)).coverPhotoUrl).toBeTruthy();

  await asGuest(async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    const cover = guestPage.locator("#root").getByRole("img", { name: `${shop.name}の代表写真` }).filter({ visible: true });
    await expect(cover).toHaveJSProperty("naturalWidth", 320);
    const mealRecordImages = guestPage.getByRole("list", { name: "記録の画像" }).filter({ visible: true });
    await mealRecordImages.getByRole("button", { name: `画像 1 / 1: ${caption}を拡大` }).click();
    const lightbox = guestPage.getByRole("dialog");
    await expect(lightbox.getByRole("img", { name: caption })).toHaveJSProperty("naturalWidth", 320);
    await expect(lightbox).toContainText(caption);
    await guestPage.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
    // Esc closed only the lightbox.
    await expect(cover).toBeVisible();
  });

  await images.getByRole("button", { name: "画像 1 を削除" }).click();
  const confirm = page.getByRole("dialog").filter({ hasText: "この画像を削除しますか？" });
  await confirm.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByText("画像を削除しました")).toBeVisible();
  await expect(images).toHaveCount(0);
  expect((await api.getShop(shop.id)).coverPhotoUrl).toBeUndefined();

  await asGuest(async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await expect(guestPage.locator("#root").getByRole("button", { name: "閉じる" })).toBeVisible();
    await expect(guestPage.getByRole("list", { name: "食べた記録" }).filter({ visible: true })).toBeVisible();
    await expect(guestPage.getByRole("img", { name: `${shop.name}の代表写真` })).toHaveCount(0);
    await expect(guestPage.getByRole("list", { name: "記録の画像" })).toHaveCount(0);
  });
});

test("admin adds a meal record image by dropping the file onto the image area", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} ドロップする店`, eaten: true, rate: 80 });

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "食べた記録", exact: true }).click();
  const jpeg = (await readFile(MEAL_RECORD_IMAGE)).toString("base64");
  const dataTransfer = await page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "dropped.jpg", { type: "image/jpeg" }));
    return transfer;
  }, jpeg);
  const area = dialog.getByRole("group", { name: /^画像（/ });
  await area.dispatchEvent("dragenter", { dataTransfer });
  await area.dispatchEvent("dragover", { dataTransfer });
  await area.dispatchEvent("drop", { dataTransfer });

  const images = dialog.getByRole("list", { name: "記録の画像" });
  await expect(images.getByRole("listitem")).toHaveCount(1);
  await expect(images.getByRole("img", { name: "画像 1" })).toHaveJSProperty("naturalWidth", 320);
});

test("admin sets 絶対行きたい and a guest sees it", async ({ page, api, asGuest }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 絶対行きたい店` });

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("radiogroup", { name: "気になる度" }).getByRole("radio", { name: "絶対行きたい" }).click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存しました")).toBeVisible();
  expect((await api.getShop(shop.id)).wishLevel).toBe("high");

  await asGuest(async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await guestPage.getByRole("complementary").getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
    // On the open detail and on the shop's card in the list. The sidebar's
    // 気になる度 filter toggle shows the same text, so its group is excluded.
    const outsideWishFilter = guestPage.locator(':not([role="group"][aria-label="気になる度"] *)');
    await expect(
      guestPage.getByText("絶対行きたい", { exact: true }).filter({ visible: true }).and(outsideWishFilter),
    ).toHaveCount(2);
  });
});
