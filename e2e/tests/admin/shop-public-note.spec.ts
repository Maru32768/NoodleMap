import { expect, test, uid } from "../../support/fixtures.ts";

test("admin writes a shop's 公開メモ and the shop detail shows it", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 公開メモを書く店` });

  await page.goto("/admin");
  await page.getByPlaceholder("店名・読み・住所・タグで絞り込み...").filter({ visible: true }).fill(id);
  const row = page.getByRole("row").filter({ hasText: shop.name });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "編集" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: shop.name });
  await dialog.getByRole("textbox", { name: "公開メモ" }).fill("  特製中華そばがおすすめ\n味玉は早めに売り切れる  ");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存しました")).toBeVisible();
  expect((await api.getShop(shop.id)).publicNote).toBe("特製中華そばがおすすめ\n味玉は早めに売り切れる");

  await page.goto("/search");
  const sidebar = page.getByRole("complementary");
  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
  await sidebar.getByText(shop.name, { exact: true }).click();
  const detail = page.locator("#root");
  await expect(detail.getByText("公開メモ - Public Note").filter({ visible: true })).toBeVisible();
  await expect(detail.getByText(/特製中華そばがおすすめ\s+味玉は早めに売り切れる/).filter({ visible: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("shop-public-note-detail.png") });
});
