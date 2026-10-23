import { expect, test } from "../../support/fixtures.ts";

test("guest visiting /admin is sent to the Google login page", async ({ page }) => {
  // The fixture blocks the request, so the button never renders, but the
  // attempt proves the login page mounted with a client id.
  const gsiScriptRequest = page.waitForRequest("https://accounts.google.com/gsi/client");

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fadmin$/);
  await gsiScriptRequest;
  await expect(page.getByText("ADMIN", { exact: true })).toHaveCount(0);
});
