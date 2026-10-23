import { seedSession } from "../support/db.ts";
import { ADMIN_EMAIL, ADMIN_STATE, BASE_URL, SESSION_COOKIE } from "../support/env.ts";
import { expect, test } from "../support/fixtures.ts";

test("seed an admin session and save it as the admin storage state", async ({ context }) => {
  await context.addCookies([
    { name: SESSION_COOKIE, value: seedSession(ADMIN_EMAIL), url: BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);

  const me = await context.request.get("/api/v1/auth/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ email: ADMIN_EMAIL, isAdmin: true });

  await context.storageState({ path: ADMIN_STATE });
});
