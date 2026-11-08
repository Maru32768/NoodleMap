import type { Page } from "@playwright/test";
import type { components } from "../../../web/src/generated/api.ts";
import { expect, test, uid } from "../../support/fixtures.ts";

type BusinessHours = components["schemas"]["BusinessHours"];

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Open around the clock, so the test passes at any time of day.
const allDay: BusinessHours = {
  kind: "weekly",
  days: WEEKDAYS.map((day) => ({ day, periods: [{ opensAt: "00:00", closesAt: "24:00" }] })),
  note: "スープがなくなり次第終了",
  checkedOn: "2026-11-01",
};

// The browser runs in Asia/Tokyo (playwright.config.ts) while CI runs Node in UTC, so today is taken in Japan.
function todayInJapan(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

async function openEditModal(page: Page, name: string, filter: string) {
  await page.goto("/admin");
  await page.getByPlaceholder("店名・読み・住所・タグで絞り込み...").filter({ visible: true }).fill(filter);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "編集" }).click();
  return page.getByRole("dialog").filter({ hasText: name });
}

test("admin enters 営業時間 in the edit modal and today's 確認日 is stored", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 営業時間を入れる店` });

  const dialog = await openEditModal(page, shop.name, id);
  await dialog.getByRole("radio", { name: "通常" }).click();
  await dialog.getByRole("button", { name: "月 に時間帯を追加" }).click();
  await dialog.getByRole("textbox", { name: "月 時間帯1 開始" }).fill("11:00");
  await dialog.getByRole("textbox", { name: "月 時間帯1 終了" }).fill("26:00");
  await dialog.getByRole("button", { name: "月曜の時間を火〜金にコピー" }).click();
  await dialog.getByRole("button", { name: "水曜の休む週: 第2" }).click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存しました")).toBeVisible();
  const saved = (await api.getShop(shop.id)).businessHours;
  const period = [{ opensAt: "11:00", closesAt: "26:00" }];
  expect(saved).toEqual({
    kind: "weekly",
    days: [
      { day: "mon", periods: period },
      { day: "tue", periods: period },
      { day: "wed", periods: period, closedWeeks: [2] },
      { day: "thu", periods: period },
      { day: "fri", periods: period },
      { day: "sat", periods: [] },
      { day: "sun", periods: [] },
    ],
    checkedOn: todayInJapan(),
  });
});

test("the map narrows to shops 営業中 now and a shop's 営業時間 unfold", async ({ page, api }) => {
  const id = uid();
  const open = await api.createShop({ name: `${id} いつも開いている店` });
  const irregular = await api.createShop({ name: `${id} 不定休の店` });
  const unknown = await api.createShop({ name: `${id} 営業時間不明の店` });
  await api.updateShop(open, { businessHours: allDay });
  await api.updateShop(irregular, { businessHours: { kind: "irregular", days: [] } });

  await page.goto("/search");
  const sidebar = page.getByRole("complementary");
  const card = (name: string) => sidebar.getByText(name, { exact: true });
  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
  for (const shop of [open, irregular, unknown]) {
    await expect(card(shop.name)).toBeVisible();
  }

  const hours = sidebar.getByRole("group", { name: "営業時間" });
  await hours.getByRole("button", { name: "今営業中", exact: true }).click();
  await expect(card(open.name)).toBeVisible();
  await expect(card(irregular.name)).toBeHidden();
  await expect(card(unknown.name)).toBeHidden();

  await card(open.name).click();
  const detail = page.locator("#root");
  const headline = detail.getByRole("button", { name: /^営業中・0:00まで/ }).filter({ visible: true });
  await expect(headline).toHaveAttribute("aria-expanded", "false");
  await headline.click();
  await expect(headline).toHaveAttribute("aria-expanded", "true");
  await expect(detail.getByText("スープがなくなり次第終了").filter({ visible: true })).toBeVisible();
  await expect(detail.getByText(/2026年11月確認/).filter({ visible: true })).toBeVisible();
  await expect(detail.getByText("00:00〜24:00").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("business-hours-detail.png") });

  // The choice is not kept for the next visit.
  await page.reload();
  await sidebar.getByPlaceholder("店名・読み・エリア・タグで検索...").fill(id);
  await expect(card(irregular.name)).toBeVisible();
  await card(irregular.name).click();
  await expect(detail.getByText("不定休", { exact: true }).filter({ visible: true })).toBeVisible();
});
