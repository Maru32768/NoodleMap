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

test("admin adds a shop link that guests see in the shop detail", async ({ page, api, browser, baseURL }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} リンクのある店` });
  const url = `https://x.com/${id}`;

  await openAdmin(page);
  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "＋ リンクを追加" }).click();
  const row = dialog.getByRole("group", { name: "リンク 1" });
  await row.getByRole("textbox", { name: "URL" }).fill(url);
  await expect(row.getByRole("combobox", { name: "種類" })).toHaveValue("twitter");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存しました")).toBeVisible();
  expect((await api.getShop(shop.id)).links).toEqual([{ type: "twitter", url }]);

  const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await guest.route(
      (u) => u.hostname !== "localhost",
      (route) => route.abort("blockedbyclient"),
    );
    const guestPage = await guest.newPage();
    await guestPage.goto("/search");
    const sidebar = guestPage.getByRole("complementary");
    await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
    await sidebar.getByText(shop.name, { exact: true }).click();
    const link = guestPage
      .getByRole("list", { name: "店舗リンク" })
      .filter({ visible: true })
      .getByRole("link", { name: "Twitter" });
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  } finally {
    await guest.close();
  }
});

test("admin deletes a shop from the edit modal", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 削除する店`, eaten: true, rate: 50 });

  await openAdmin(page);
  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("button", { name: "削除", exact: true }).click();
  const confirm = page
    .getByRole("dialog")
    .filter({ hasText: `「${shop.name}」を削除しますか？この操作は取り消せません。` });
  await confirm.getByRole("button", { name: "削除", exact: true }).click();

  await expect(page.getByText("店舗を削除しました")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: shop.name })).toHaveCount(0);
  expect((await api.listShops()).map((s) => s.id)).not.toContain(shop.id);
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

  // The E2E backend has no Places key, so the Google Place search is unavailable; the form still works.
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

test("admin adds two shops in a row without a Google Place ID", async ({ page, api }) => {
  const id = uid();
  const names = [`${id} 手入力の店1`, `${id} 手入力の店2`];
  await openAdmin(page);

  for (const name of names) {
    await page.getByRole("button", { name: "店舗追加" }).click();
    await page.getByRole("button", { name: /Googleで検索して追加/ }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" });
    await dialog.locator('label:has-text("店名") + input').fill(name);
    await dialog.locator('label:has-text("緯度") + input').fill("35.6812");
    await dialog.locator('label:has-text("経度") + input').fill("139.7671");
    await expect(dialog.locator('label:has-text("Google Place ID") + input')).toHaveValue("");
    await dialog.getByRole("button", { name: "追加", exact: true }).click();

    await expect(dialog).toBeHidden();
  }

  const added = (await api.listShops()).filter((s) => names.includes(s.name));
  expect(added).toHaveLength(2);
  expect(added.map((s) => s.googlePlaceId)).toEqual([undefined, undefined]);
});

test("add form shows a duplicate Google Place ID under its input", async ({ page, api }) => {
  const existing = await api.createShop({ name: `${uid()} 既存の店` });
  const existingPlaceId = existing.googlePlaceId;
  if (!existingPlaceId) throw new Error("createShop always sets a Google Place ID");
  const name = `${uid()} 重複する店`;
  await openAdmin(page);

  await page.getByRole("button", { name: "店舗追加" }).click();
  await page.getByRole("button", { name: /Googleで検索して追加/ }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" });
  await dialog.locator('label:has-text("店名") + input').fill(name);
  await dialog.locator('label:has-text("緯度") + input').fill("35.6812");
  await dialog.locator('label:has-text("経度") + input').fill("139.7671");
  const placeIdInput = dialog.locator('label:has-text("Google Place ID") + input');
  await placeIdInput.fill(existingPlaceId);
  await dialog.getByRole("button", { name: "追加", exact: true }).click();

  const message = dialog.getByText("Google Place ID が他の店舗と重複しています");
  await expect(message).toBeVisible();
  await expect(placeIdInput).toHaveAttribute("aria-invalid", "true");
  await expect(dialog).toBeVisible();
  expect((await api.listShops()).some((s) => s.name === name)).toBe(false);

  await placeIdInput.fill(`${existingPlaceId}-new`);
  await expect(message).toBeHidden();
  await expect(placeIdInput).not.toHaveAttribute("aria-invalid");
});

test("add form falls back to manual entry when Google Places is not configured", async ({ page }) => {
  // No route stub: the E2E backend runs without GOOGLE_PLACES_API_KEY and answers 503.
  await openAdmin(page);
  await page.getByRole("button", { name: "店舗追加" }).click();
  await page.getByRole("button", { name: /Googleで検索して追加/ }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" });
  await dialog.getByRole("combobox", { name: "Google Place を検索" }).fill("ラーメン");

  await expect(
    dialog.getByText("Google Place 検索を利用できません。店舗情報はフォームに直接入力できます。"),
  ).toBeVisible();
  const name = dialog.locator('label:has-text("店名") + input');
  await name.fill("手入力できる");
  await expect(name).toHaveValue("手入力できる");
});

test("admin fills the add form from a Google Place search", async ({ page }) => {
  const sessionTokens: string[] = [];
  await page.route("**/api/v1/auth/google-places/autocomplete?*", (route) => {
    sessionTokens.push(new URL(route.request().url()).searchParams.get("sessionToken") ?? "");
    return route.fulfill({
      json: { suggestions: [{ placeId: "e2e-place", mainText: "麺屋テスト", secondaryText: "東京都千代田区" }] },
    });
  });
  await page.route("**/api/v1/auth/google-places/details?*", (route) => {
    sessionTokens.push(new URL(route.request().url()).searchParams.get("sessionToken") ?? "");
    return route.fulfill({
      json: {
        placeId: "e2e-place",
        name: "麺屋テスト",
        postalCode: "100-0005",
        address: "東京都千代田区丸の内１丁目",
        lat: 35.6812,
        lng: 139.7671,
        closed: false,
      },
    });
  });
  await openAdmin(page);
  await page.getByRole("button", { name: "店舗追加" }).click();
  await page.getByRole("button", { name: /Googleで検索して追加/ }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "新しい店舗を追加" });

  await dialog.getByRole("combobox", { name: "Google Place を検索" }).fill("麺屋");
  await dialog.getByText("麺屋テスト 東京都千代田区").click();

  await expect(dialog.locator('label:has-text("店名") + input')).toHaveValue("麺屋テスト");
  await expect(dialog.locator('label:has-text("住所") + input')).toHaveValue("東京都千代田区丸の内１丁目");
  await expect(dialog.locator('label:has-text("郵便番号") + input')).toHaveValue("100-0005");
  await expect(dialog.locator('label:has-text("Google Place ID") + input')).toHaveValue("e2e-place");
  await expect(dialog.locator('label:has-text("緯度") + input')).toHaveValue("35.6812");
  // The details call closes the autocomplete billing session it belongs to.
  expect(new Set(sessionTokens).size).toBe(1);
  expect(sessionTokens[0]).not.toBe("");
});

test("dropping a pin on the map opens the add form", async ({ page }) => {
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
