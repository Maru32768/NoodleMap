import { expect, test, uid } from "../../support/fixtures.ts";

test("guest searches, filters and opens a shop on the search page", async ({ page, api }) => {
  const id = uid();
  const tag = await api.addTag({ label: `${id}-tag`, slug: `${id}-tag`, category: "ramen" });
  const eatenRamen = await api.createShop({
    name: `${id} 中華そば`,
    eaten: true,
    rate: 80,
    tagIds: [tag.id],
  });
  const wishRamen = await api.createShop({ name: `${id} 家系ラーメン` });
  const wishUdon = await api.createShop({ name: `${id} 讃岐うどん`, category: "udon" });

  await page.goto("/");
  await expect(page).toHaveURL(/\/search$/);

  const sidebar = page.getByRole("complementary");
  const card = (name: string) => sidebar.getByText(name, { exact: true });
  const count = (n: number) => sidebar.getByText(new RegExp(`^${n}\\s*件 / SHOPS`));

  await sidebar.getByPlaceholder("店名、エリアで検索...").fill(id);
  await expect(count(3)).toBeVisible();
  for (const shop of [eatenRamen, wishRamen, wishUdon]) {
    await expect(card(shop.name)).toBeVisible();
  }

  const chip = (name: string) => sidebar.getByRole("button", { name, exact: true });

  await chip("食べた").click();
  await expect(count(2)).toBeVisible();
  await expect(card(eatenRamen.name)).toBeHidden();
  await chip("食べた").click();

  await chip("うどん").click();
  await expect(count(2)).toBeVisible();
  await expect(card(wishUdon.name)).toBeHidden();
  await chip("うどん").click();

  await chip(tag.label).click();
  await expect(count(1)).toBeVisible();
  await expect(card(eatenRamen.name)).toBeVisible();
  await chip(tag.label).click();

  await sidebar.getByPlaceholder("店名、エリアで検索...").fill(`${id} 讃岐`);
  await expect(count(1)).toBeVisible();
  await expect(card(wishUdon.name)).toBeVisible();

  await sidebar.getByPlaceholder("店名、エリアで検索...").fill(id);
  await card(eatenRamen.name).click();
  const favorite = page.getByText("お気に入り度 - Favorite");
  await expect(favorite).toBeVisible();
  await expect(page.getByRole("button", { name: "編集" })).toHaveCount(0);

  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(favorite).toBeHidden();
});
