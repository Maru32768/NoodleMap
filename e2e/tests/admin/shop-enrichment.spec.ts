import type { Page } from "@playwright/test";
import { expect, type Shop, type Tag, test, uid } from "../../support/fixtures.ts";
// @ts-expect-error A plain .mjs script: this test runs the real validator so the file format cannot drift from the screen.
import { validateResults } from "../../../.claude/skills/shop-research/scripts/validate-results.mjs";

const TODAY = "2026-11-06";
const FIELDS = [
  "name",
  "name_kana",
  "opened_at",
  "closed_at",
  "temporary_closure",
  "business_hours",
  "tag",
  "link.tabelog",
  "link.official",
];

const tabelogEvidence = {
  url: "https://tabelog.com/tokyo/A1319/A131905/13000000/",
  sourceKind: "tabelog",
  observedAt: TODAY,
  note: "店名と番地が一致",
};
const officialEvidence = {
  url: "https://toho-seiso.example/news",
  sourceKind: "official_site",
  observedAt: TODAY,
  note: "公式サイトのお知らせ",
};

/** What export-batch.mjs writes for this shop, as the research saw it. */
function batchShop(shop: Shop) {
  return {
    id: shop.id,
    name: shop.name,
    nameKana: shop.nameKana ?? null,
    address: shop.address,
    category: shop.category,
    openedAt: shop.openedAt ?? null,
    closedAt: shop.closedAt ?? null,
    temporaryClosure: null,
    businessHours: shop.businessHours ?? null,
    tags: shop.tags.map((tag) => tag.slug),
    links: shop.links,
  };
}

function resultFor(shop: Shop, proposals: { field: string; value: unknown; checkField?: string }[]) {
  const checks = Object.fromEntries(FIELDS.map((field) => [field, "no_evidence"]));
  for (const { field, checkField } of proposals) {
    checks[checkField ?? field] = "found";
  }
  return JSON.stringify({
    shopId: shop.id,
    checks,
    proposals: proposals.map(({ field, value, checkField }) => ({
      field,
      value,
      // Tabelog backs only the link to its own page.
      evidence: [checkField === "link.tabelog" ? tabelogEvidence : officialEvidence],
    })),
    notices: [],
    tagCandidates: [],
  });
}

function acceptedJsonl(shops: Shop[], tags: Tag[], results: Map<string, string>) {
  const { accepted, rejected } = validateResults({
    batch: {
      schemaVersion: 1,
      runId: "b07-e2e",
      createdAt: TODAY,
      fields: FIELDS,
      tags: tags.map(({ slug, label, category }) => ({ slug, label, category: category ?? null })),
      shops: shops.map(batchShop),
    },
    readResult: (id: string) => results.get(id) ?? null,
    today: TODAY,
  });
  expect(rejected).toEqual([]);
  return accepted.map((record: unknown) => JSON.stringify(record)).join("\n");
}

async function openWith(page: Page, jsonl: string) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "調査結果を取り込み" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "調査結果の取り込み" });
  await dialog.getByLabel("ファイルを選ぶ").setInputFiles({
    name: "accepted.jsonl",
    mimeType: "application/x-ndjson",
    buffer: Buffer.from(jsonl),
  });
  await expect(dialog.getByText("b07-e2e")).toBeVisible();
  return dialog;
}

test("applies the chosen proposals from a validated file and leaves the rest of the shop alone", async ({
  page,
  api,
}) => {
  const id = uid();
  const tag = await api.addTag({ label: `${id}タグ`, slug: `${id}-tag` });
  const shop = await api.createShop({ name: `${id} 店`, address: `東京都杉並区${id}`, eaten: true, rate: 72 });
  await api.updateShop(shop, { closedAt: "2030-01-01", wishLevel: "high" });
  const before = await api.getShop(shop.id);
  const tabelog = "https://tabelog.com/tokyo/A1319/A131905/13000000/";

  const jsonl = acceptedJsonl(
    [before],
    await api.listTags(),
    new Map([
      [
        shop.id,
        resultFor(before, [
          { field: "name_kana", value: "とうほう" },
          { field: "opened_at", value: "2020-06-28" },
          { field: "tag", value: tag.slug },
          { field: "link", checkField: "link.tabelog", value: { type: "tabelog", url: tabelog } },
          { field: "name", value: `${id} 見送る店名` },
        ]),
      ],
    ]),
  );
  const dialog = await openWith(page, jsonl);

  // Nothing changes until something is applied.
  expect(await api.getShop(shop.id)).toEqual(before);

  await dialog.getByRole("button", { name: "表示中の一括可を選択" }).click();
  // Only the Tabelog link citing its own page passes without a person; the rest are chosen one by one.
  await expect(dialog.getByRole("button", { name: "選択した 1 件を本番へ反映" })).toBeVisible();
  await expect(dialog.getByLabel("店名を選択")).not.toBeChecked();
  for (const label of ["読みを選択", "開店日を選択", "タグを選択"]) {
    // The input is visually hidden, so click the checkbox root it sits in.
    await dialog.getByLabel(label).locator("xpath=..").click();
    await expect(dialog.getByLabel(label)).toBeChecked();
  }
  await dialog.getByRole("button", { name: "選択した 4 件を本番へ反映" }).click();
  await expect(dialog.getByText("反映が終わりました")).toBeVisible();
  await expect(dialog.getByText(/反映 4 件/)).toBeVisible();

  const after = await api.getShop(shop.id);
  expect(after).toMatchObject({
    name: before.name,
    nameKana: "とうほう",
    openedAt: "2020-06-28",
    // updateShop clears a missing date, and these values must survive.
    closedAt: "2030-01-01",
    address: before.address,
    wishLevel: "high",
    rate: 72,
    lat: before.lat,
    lng: before.lng,
    postalCode: before.postalCode,
    googlePlaceId: before.googlePlaceId,
    mealRecordCount: 1,
    links: [{ type: "tabelog", url: tabelog }],
  });
  expect(after.tags.map((t) => t.slug)).toEqual([tag.slug]);

  // Loading the same file again finds them applied and sends nothing.
  await page.reload();
  const again = await openWith(page, jsonl);
  await expect(again.getByRole("radio", { name: "適用済み (4)" })).toBeVisible();
  await expect(again.getByRole("radio", { name: "未適用 (1)" })).toBeVisible();
  expect(await api.getShop(shop.id)).toEqual(after);
});

test("applies 営業時間 one by one with the evidence date as the 確認日", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 店` });
  await api.updateShop(shop, { businessHours: { kind: "irregular", days: [] } });
  const before = await api.getShop(shop.id);
  const week = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => ({
    day,
    periods: day === "sun" ? [] : [{ opensAt: "11:00", closesAt: "15:00" }],
  }));

  const jsonl = acceptedJsonl(
    [before],
    await api.listTags(),
    new Map([[shop.id, resultFor(before, [{ field: "business_hours", value: { kind: "weekly", days: week, note: "ラストオーダー14:30" } }])]]),
  );
  const dialog = await openWith(page, jsonl);
  const row = dialog.getByRole("group", { name: "営業時間" });
  await expect(row.getByText("影響の大きい項目")).toBeVisible();
  await expect(row.getByText(/月 11:00〜15:00/)).toBeVisible();

  await dialog.getByRole("button", { name: "表示中の一括可を選択" }).click();
  await expect(dialog.getByLabel("営業時間を選択")).not.toBeChecked();
  await dialog.getByLabel("営業時間を選択").locator("xpath=..").click();
  await dialog.getByRole("button", { name: "選択した 1 件を本番へ反映" }).click();
  await expect(dialog.getByText("反映が終わりました")).toBeVisible();

  expect((await api.getShop(shop.id)).businessHours).toEqual({
    kind: "weekly",
    days: week,
    note: "ラストオーダー14:30",
    checkedOn: TODAY,
  });
});

test("shows a shop edited after the research as a conflict and keeps the edit", async ({ page, api }) => {
  const id = uid();
  const shop = await api.createShop({ name: `${id} 店` });
  const jsonl = acceptedJsonl(
    [shop],
    await api.listTags(),
    new Map([[shop.id, resultFor(shop, [{ field: "opened_at", value: "2020-06-28" }])]]),
  );

  // Production moves on after the research: the local copy is older.
  await api.updateShop(shop, { openedAt: "2019-01-01" });

  const dialog = await openWith(page, jsonl);
  await expect(dialog.getByText("本番の値が調査時と違う")).toBeVisible();
  await dialog.getByRole("button", { name: "表示中の一括可を選択" }).click();
  await expect(dialog.getByRole("button", { name: "選択した 0 件を本番へ反映" })).toBeDisabled();
  expect((await api.getShop(shop.id)).openedAt).toBe("2019-01-01");
});

test("refuses a file that is not a validated result", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "調査結果を取り込み" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "調査結果の取り込み" });
  await dialog.getByLabel("ファイルを選ぶ").setInputFiles({
    name: "raw.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ shopId: "x", proposals: [] })),
  });
  await expect(dialog.getByRole("alert")).toContainText("読み込めませんでした");
});

test("a guest cannot reach the screen", async ({ asGuest }) => {
  await asGuest(async (page) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "調査結果を取り込み" })).toHaveCount(0);
  });
});
