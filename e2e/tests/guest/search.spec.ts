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
  const countLabel = (n: number) => sidebar.getByText(new RegExp(`^${n}\\s*件 / SHOPS`));

  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
  await expect(countLabel(3)).toBeVisible();
  for (const shop of [eatenRamen, wishRamen, wishUdon]) {
    await expect(card(shop.name)).toBeVisible();
  }

  const chip = (name: string) => sidebar.getByRole("button", { name, exact: true });

  await chip("食べた").click();
  await expect(countLabel(2)).toBeVisible();
  await expect(card(eatenRamen.name)).toBeHidden();
  await chip("食べた").click();

  // 絶対行きたい alone keeps only the eaten shop (eaten shops are never
  // narrowed); adding 気になる ORs in the unset ones, which count as 気になる.
  // Every step changes the count, so a stale render cannot pass.
  const wishLevel = sidebar.getByRole("group", { name: "気になる度" });
  const level = (label: string) => wishLevel.getByRole("button", { name: `気になる度: ${label}`, exact: true });
  const toggleLevel = async (label: string, pressed: boolean) => {
    await level(label).click();
    await expect(level(label)).toHaveAttribute("aria-pressed", String(pressed));
  };
  await toggleLevel("絶対行きたい", true);
  await expect(countLabel(1)).toBeVisible();
  await expect(card(eatenRamen.name)).toBeVisible();
  await toggleLevel("気になる", true);
  await expect(countLabel(3)).toBeVisible();
  await toggleLevel("気になる", false);
  await expect(countLabel(1)).toBeVisible();
  await toggleLevel("絶対行きたい", false);
  await expect(countLabel(3)).toBeVisible();

  await chip("うどん").click();
  await expect(countLabel(2)).toBeVisible();
  await expect(card(wishUdon.name)).toBeHidden();
  await chip("うどん").click();

  await chip(tag.label).click();
  await expect(countLabel(1)).toBeVisible();
  await expect(card(eatenRamen.name)).toBeVisible();
  await chip(tag.label).click();

  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(`${id} 讃岐`);
  await expect(countLabel(1)).toBeVisible();
  await expect(card(wishUdon.name)).toBeVisible();

  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
  await card(eatenRamen.name).click();
  const rating = page.getByText("お気に入り度 - Favorite");
  await expect(rating).toBeVisible();
  await expect(page.getByRole("button", { name: "編集" })).toHaveCount(0);

  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(rating).toBeHidden();
});

test("guest opens a shared shop URL even when filters hide the shop", async ({ page, api }) => {
  const shop = await api.createShop({ name: `${uid()} 共有ラーメン`, eaten: true, rate: 80 });

  // Persist a filter that hides every ramen shop.
  await page.goto("/search");
  await page.getByRole("complementary").getByRole("button", { name: "ラーメン", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("noodle-map:search-state:v1")))
    .toContain('"ramen":false');

  await page.goto(`/search?shop=${shop.id}`);
  await expect(page.getByText(shop.name, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("お気に入り度 - Favorite")).toBeVisible();

  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByText(shop.name, { exact: true })).toBeHidden();
  await expect(page).toHaveURL(/\/search$/);
});

test("guest drops an unknown shop id from the URL", async ({ page }) => {
  await page.goto("/search?shop=00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/search$/);
});

test("guest copies a shop's share URL", async ({ page, api, baseURL }) => {
  const shop = await api.createShop({ name: `${uid()} 共有つけ麺` });
  await page.addInitScript(() => {
    // Desktop copies the URL instead of sharing; record what gets copied.
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });

  await page.goto("/search");
  const sidebar = page.getByRole("complementary");
  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(shop.name);
  await sidebar.getByText(shop.name, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?shop=${shop.id}$`));

  await page.getByRole("button", { name: "共有" }).click();
  await expect(page.getByText("URLをコピーしました")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(
    `${baseURL}/r/${shop.id}`,
  );
});

test("guest opening a share URL lands on the shop's detail", async ({ page, api }) => {
  const shop = await api.createShop({ name: `${uid()} 共有まぜそば`, eaten: true, rate: 80 });

  await page.goto(`/r/${shop.id}`);
  await expect(page).toHaveURL(new RegExp(`/search\\?shop=${shop.id}$`));
  // The name can also be visible in the sidebar list, so check the open detail via its close button.
  await expect(page.getByText(shop.name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
});
