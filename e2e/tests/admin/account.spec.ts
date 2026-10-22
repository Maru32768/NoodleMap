import { seedSession } from "../../support/db.ts";
import { BASE_URL, SESSION_COOKIE } from "../../support/env.ts";
import { expect, test, uid } from "../../support/fixtures.ts";

// A fresh non-admin user so the session list holds only what this test seeds.
test.use({ storageState: { cookies: [], origins: [] } });

test("a user revokes their other sessions from マイページ", async ({ page, context, playwright, baseURL }) => {
  const email = `${uid()}@example.test`;
  const token = seedSession(email);
  const others = [seedSession(email), seedSession(email)];
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);

  await page.goto("/search");
  await page.getByRole("link", { name: "マイページ" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email)).toBeVisible();

  const rows = page.getByRole("list", { name: "ログイン中の端末" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "この端末" })).toHaveCount(1);

  await rows.filter({ hasNotText: "この端末" }).first().getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(rows).toHaveCount(2);

  await page.getByRole("button", { name: "この端末以外をすべてログアウト" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("この端末");

  for (const [stale, status] of [...others.map((t) => [t, 401] as const), [token, 200] as const]) {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${stale}` },
    });
    expect((await request.get("/api/v1/auth/me")).status()).toBe(status);
    await request.dispose();
  }
});
