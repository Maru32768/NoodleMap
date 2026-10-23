import { expect, test, uid } from "../../support/fixtures.ts";

test("guest searches, filters and opens a shop from the mobile sheet", async ({ page, api }) => {
  const id = uid();
  const ramen = await api.createShop({ name: `${id} 煮干しそば`, eaten: true, rate: 60 });
  const udon = await api.createShop({ name: `${id} 釜玉うどん`, category: "udon" });

  await page.goto("/search");
  await expect(page.getByRole("complementary")).toBeHidden();

  const countLabel = (n: number) => page.getByText(new RegExp(`^${n}\\s*件 / SHOPS$`));
  await page
    .getByPlaceholder("店名・読み・エリア・タグで検索...")
    .filter({ visible: true })
    .fill(id);
  await expect(countLabel(2)).toBeVisible();

  await page.getByRole("button", { name: "フィルター" }).click();
  const filters = page.getByRole("dialog", { name: "フィルター" });
  await filters.getByRole("button", { name: "うどん", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(filters).toBeHidden();
  await expect(countLabel(1)).toBeVisible();

  // The sheet rests at a peek height; drag its handle up to reveal the list.
  const handle = await countLabel(1).boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, 120, { steps: 10 });
  await page.mouse.up();

  await page.getByText(ramen.name, { exact: true }).click();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
  await expect(page.getByText(udon.name)).toHaveCount(0);
});

test("guest opens a shared shop URL in the mobile sheet", async ({ page, api }) => {
  const shop = await api.createShop({ name: `${uid()} 共有まぜそば` });

  await page.goto(`/search?shop=${shop.id}`);
  // The desktop detail panel is in the DOM too, hidden by a media query.
  await expect(page.getByText(shop.name, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
});
