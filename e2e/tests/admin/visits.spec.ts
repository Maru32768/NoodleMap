import type { Browser, Page } from "@playwright/test";
import { expect, test, uid } from "../../support/fixtures.ts";

async function openEditModal(page: Page, name: string, filter: string) {
  await page.goto("/admin");
  await page.getByPlaceholder("店名・読み・住所・タグで絞り込み...").filter({ visible: true }).fill(filter);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "編集" }).click();
  return page.getByRole("dialog").filter({ hasText: name });
}

/** Runs `fn` with a signed-out page that can only reach the app. */
async function asGuest(browser: Browser, baseURL: string | undefined, fn: (page: Page) => Promise<void>) {
  const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await guest.route(
      (u) => u.hostname !== "localhost",
      (route) => route.abort("blockedbyclient"),
    );
    await fn(await guest.newPage());
  } finally {
    await guest.close();
  }
}

test("admin records a visit that guests see without its private note", async ({ page, api, browser, baseURL }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 訪問を記録する店` });
  const publicNote = `${id} 公開メモ`;
  const privateNote = `${id} 自分用メモ`;

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "訪問ログ", exact: true }).click();
  await dialog.getByRole("button", { name: "訪問を記録" }).click();
  const form = dialog.getByRole("group", { name: "訪問を記録" });
  await form.getByRole("textbox", { name: "食べたメニュー" }).fill("特製中華そば");
  await form.getByRole("spinbutton", { name: "評価" }).fill("85");
  await form.getByRole("textbox", { name: "メモ（公開）" }).fill(publicNote);
  await form.getByRole("textbox", { name: "メモ（自分用）" }).fill(privateNote);
  await form.getByRole("button", { name: "訪問を保存" }).click();

  await expect(page.getByText("訪問ログを保存しました")).toBeVisible();
  const entry = dialog.getByRole("list", { name: "訪問ログ" }).getByRole("listitem");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("特製中華そば");
  await expect(entry).toContainText(privateNote);
  expect(await api.getShop(shop.id)).toMatchObject({ eaten: true, rate: 85, favorite: true, visitCount: 1 });
  // The shop list was refreshed: the row counts the visit and 削除 is locked.
  await expect(page.getByRole("row").filter({ hasText: shop.name })).toContainText("1回");
  await expect(dialog.getByRole("button", { name: "削除", exact: true })).toBeDisabled();
  await expect(dialog.getByText("訪問ログがある店舗は削除できません")).toBeVisible();

  await asGuest(browser, baseURL, async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await expect(guestPage.getByText("評価 - Rating")).toBeVisible();
    await expect(guestPage.getByText("1回訪問")).toBeVisible();
    const visits = guestPage.getByRole("list", { name: "訪問ログ" }).filter({ visible: true });
    await expect(visits).toContainText(publicNote);
    await expect(visits).toContainText("85");
    await expect(visits).not.toContainText(privateNote);
    await expect(guestPage.getByText(privateNote)).toHaveCount(0);
  });
});

test("deleting a shop's only visit returns it to 気になる", async ({ page, api, browser, baseURL }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 訪問を消す店`, eaten: true, rate: 85 });

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "訪問ログ", exact: true }).click();
  await dialog.getByRole("button", { name: "訪問ログを削除" }).click();
  const confirm = page.getByRole("dialog").filter({ hasText: "の訪問ログを削除しますか？" });
  await confirm.getByRole("button", { name: "削除", exact: true }).click();

  await expect(page.getByText("訪問ログを削除しました")).toBeVisible();
  await expect(dialog.getByText("まだ訪問ログがありません")).toBeVisible();
  expect(await api.getShop(shop.id)).toMatchObject({ eaten: false, favorite: false, visitCount: 0 });
  await expect(dialog.getByRole("button", { name: "削除", exact: true })).toBeEnabled();

  await asGuest(browser, baseURL, async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await expect(guestPage.getByRole("button", { name: "閉じる" })).toBeVisible();
    await expect(guestPage.getByText("評価 - Rating")).toHaveCount(0);
    await expect(guestPage.getByRole("list", { name: "訪問ログ" })).toHaveCount(0);
  });
});

test("admin sets 絶対行きたい and a guest sees it", async ({ page, api, browser, baseURL }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 絶対行きたい店` });

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("combobox", { name: "気になる度" }).selectOption({ label: "絶対行きたい" });
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存しました")).toBeVisible();
  expect((await api.getShop(shop.id)).wishLevel).toBe("high");

  await asGuest(browser, baseURL, async (guestPage) => {
    await guestPage.goto(`/search?shop=${shop.id}`);
    await expect(guestPage.getByText("絶対行きたい", { exact: true }).filter({ visible: true })).toBeVisible();
  });
});
