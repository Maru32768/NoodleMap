import { expect, test, uid } from "../../support/fixtures.ts";

test("provider links move the map and venue return preserves the route and camera without reloading", async ({
  api,
  page,
  asGuest,
}, testInfo) => {
  const prefix = uid();
  const a = await api.createShop({
    name: `${prefix} 東京の提供店`,
    lat: 35.6895,
    lng: 139.7005,
  });
  const b = await api.createShop({
    name: `${prefix} 大阪の提供店`,
    lat: 34.6937,
    lng: 135.5023,
  });
  const venueName = `${prefix} Walkerキッチン`;
  const response = await page.request.post("/api/v1/auth/meal-records", {
    data: {
      shopIds: [a.id, b.id],
      venueName,
      menuItems: [{ name: "共同の一杯" }],
    },
  });
  expect(response.ok()).toBe(true);
  const singleResponse = await page.request.post("/api/v1/auth/meal-records", {
    data: { shopIds: [a.id], menuItems: [{ name: "通常の一杯" }] },
  });
  expect(singleResponse.ok()).toBe(true);

  await asGuest(async (guest) => {
    const originalPath = `/search?shop=${a.id}&context=retained#details`;
    await guest.goto(originalPath);
    const records = guest
      .getByRole("list", { name: "食べた記録", exact: true })
      .filter({ visible: true });
    const singleEntry = records
      .getByRole("listitem")
      .filter({ hasText: "通常の一杯" });
    await expect(singleEntry).toBeVisible();
    await expect(singleEntry).not.toContainText(a.name);
    const collaboration = records
      .getByRole("listitem")
      .filter({ hasText: "共同の一杯" });
    await expect(
      collaboration.getByRole("link", { name: a.name, exact: true }),
    ).toBeVisible();
    await expect(
      collaboration.getByRole("link", { name: b.name, exact: true }),
    ).toBeVisible();
    const maps = guest
      .getByRole("link", { name: "Google Maps", exact: true })
      .filter({ visible: true });
    await expect(maps.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    await guest.evaluate(() => {
      document.documentElement.dataset.spaNavigationMarker = "retained";
    });

    const canvas = guest.locator("canvas.maplibregl-canvas");
    await canvas.focus();
    await canvas.press("ArrowRight");
    const savedCenter = () =>
      guest.evaluate(() => {
        const raw = localStorage.getItem("noodle-map:search-state:v1");
        return raw
          ? (JSON.parse(raw).mapView.center as [number, number])
          : null;
      });
    await expect.poll(async () => (await savedCenter())?.[1]).not.toBe(a.lng);
    const beforeVenue = await savedCenter();
    expect(beforeVenue).not.toBeNull();
    await collaboration
      .getByRole("link", { name: venueName, exact: true })
      .click();
    await expect(
      guest.getByRole("heading", { name: venueName, exact: true }),
    ).toBeVisible();
    await expect(
      guest
        .getByRole("list", { name: "食べた記録", exact: true })
        .getByRole("link", { name: a.name, exact: true }),
    ).toBeVisible();
    await guest.screenshot({
      path: testInfo.outputPath("venue-provider-history.png"),
      fullPage: true,
    });
    await guest.getByRole("link", { name: "地図に戻る" }).click();
    await expect(guest).toHaveURL(
      new RegExp(originalPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
    );
    await expect(records).toBeVisible();
    expect(
      await guest.evaluate(
        () => document.documentElement.dataset.spaNavigationMarker,
      ),
    ).toBe("retained");
    expect(await savedCenter()).toEqual(beforeVenue);

    await collaboration
      .getByRole("link", { name: b.name, exact: true })
      .click();
    await expect(guest).toHaveURL(new RegExp(`shop=${b.id}`));
    await expect
      .poll(async () => (await savedCenter())?.[1])
      .toBeCloseTo(b.lng, 4);
    await guest.waitForTimeout(600);
    await canvas.focus();
    await canvas.press("ArrowRight");
    await expect
      .poll(async () => {
        const center = await savedCenter();
        return (
          center !== null &&
          Math.abs(center[0] - b.lat) < 0.1 &&
          Math.abs(center[1] - b.lng) < 0.1 &&
          center[1] !== b.lng
        );
      })
      .toBe(true);
    await guest.screenshot({
      path: testInfo.outputPath("provider-map-and-actions.png"),
      fullPage: true,
    });
  });
});
