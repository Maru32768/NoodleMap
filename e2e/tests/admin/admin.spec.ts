import type { Page } from "@playwright/test";
import { seedSession } from "../../support/db.ts";
import { ADMIN_EMAIL, BASE_URL, SESSION_COOKIE } from "../../support/env.ts";
import { expect, test, uid } from "../../support/fixtures.ts";

async function openAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page.getByText("ADMIN", { exact: true })).toBeVisible();
}

async function openEditModal(page: Page, name: string, filter: string) {
  await page.getByPlaceholder("店名・読み・住所・タグで絞り込み...").filter({ visible: true }).fill(filter);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "編集" }).click();
  return page.getByRole("dialog").filter({ hasText: name });
}

test("admin edits a shop's tags, visit status and rating", async ({ page, api }) => {
  const id = uid();
  const tag = await api.addTag({ label: `${id}-tag`, slug: `${id}-tag`, category: "ramen" });
  const shop = await api.createShop({ name: `${id} 編集する店` });

  await openAdmin(page);
  let dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: tag.label }).click();
  await dialog.getByRole("button", { name: "食べた記録" }).click();
  await dialog.getByRole("switch", { name: "食べた" }).click();
  await dialog.getByRole("spinbutton").fill("60");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存しました")).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(await api.getShop(shop.id)).toMatchObject({
    eaten: true,
    rate: 60,
    tags: [expect.objectContaining({ id: tag.id })],
  });

  await page.reload();
  dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "食べた記録" }).click();
  await expect(dialog.getByRole("switch", { name: "食べた" })).toBeChecked();
  await expect(dialog.getByRole("spinbutton")).toHaveValue("60");
});

test("admin adds a tag in tag management", async ({ page, api }) => {
  const id = uid();
  await openAdmin(page);

  await page.getByRole("button", { name: "タグ管理" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "TAG SETTINGS" });
  await dialog.locator('label:text-is("タグ名") + input').fill(`${id} タグ`);
  await dialog.locator('label:text-is("Slug") + input').fill(`${id}-slug`);
  await dialog.getByRole("button", { name: "リストに追加" }).click();
  await expect(dialog.getByText(`${id}-slug · 共通 · 100`)).toBeVisible();

  const save = dialog.getByRole("button", { name: "変更を保存" });
  await save.click();
  await expect(save).toBeDisabled();

  const saved = (await api.listTags()).find((t) => t.slug === `${id}-slug`);
  expect(saved).toMatchObject({ label: `${id} タグ`, color: "#2563eb", sortOrder: 100 });
  expect(saved?.category).toBeUndefined();
});

test("admin adds a shop by typing its details into the add form", async ({ page, api }) => {
  const name = `${uid()} 手入力で追加`;
  await openAdmin(page);

  // Google is blocked, so the Google Place search pane shows its fallback; the form still works.
  await page.getByRole("button", { name: "店舗追加" }).click();
  await page.getByRole("button", { name: /Googleで検索して追加/ }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" });
  await dialog.getByRole("button", { name: "うどん", exact: true }).click();
  await dialog.locator('label:has-text("店名") + input').fill(name);
  await dialog.locator('label:has-text("緯度") + input').fill("35.6812");
  await dialog.locator('label:has-text("経度") + input').fill("139.7671");
  await dialog.getByRole("button", { name: "追加", exact: true }).click();

  await expect(page.getByText("店舗を追加しました")).toBeVisible();
  await expect(dialog).toBeHidden();
  const added = (await api.listShops()).find((s) => s.name === name);
  expect(added).toMatchObject({ category: "udon", lat: 35.6812, lng: 139.7671, eaten: false });
});

test("admin page works when the Google Maps JS cannot load", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} Maps なしで表示` });
  await page.route(/maps\.googleapis\.com/, (route) => route.abort("blockedbyclient"));
  await openAdmin(page);

  await page.getByPlaceholder("店名・読み・住所・タグで絞り込み...").filter({ visible: true }).fill(id);
  await expect(page.getByRole("row").filter({ hasText: shop.name })).toHaveCount(1);
  await page.getByRole("button", { name: "店舗追加" }).click();
  await page.getByRole("button", { name: /Googleで検索して追加/ }).click();
  await expect(
    page.getByRole("dialog").getByText("Google マップを読み込めませんでした", { exact: false }),
  ).toBeVisible();
});

test("admin adds a shop by dropping a pin on the map", async ({ page }) => {
  await openAdmin(page);

  await page.getByRole("button", { name: "店舗追加" }).click();
  await page.getByRole("button", { name: /地図上でピンを立てて追加/ }).click();
  await page.locator(".nm-adding-mode canvas").click();

  await expect(page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" })).toBeVisible({
    timeout: 5_000,
  });
});

test("signed-in admin is redirected away from /login", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/search$/);
});

test.describe("logout", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("logout revokes the session on the server", async ({ page, context, playwright, baseURL }) => {
    const token = seedSession(ADMIN_EMAIL);
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: BASE_URL, httpOnly: true, sameSite: "Lax" },
    ]);
    await openAdmin(page);

    // The UI has no logout control; drive the endpoint with the page's cookies.
    expect((await page.request.post("/api/v1/auth/logout")).ok()).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fadmin$/);

    const stale = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect((await stale.get("/api/v1/auth/me")).status()).toBe(401);
    await stale.dispose();
  });
});
