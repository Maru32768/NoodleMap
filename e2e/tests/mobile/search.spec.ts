import { expect, test, uid } from "../../support/fixtures.ts";

test("guest searches, filters and opens a shop from the mobile sheet", async ({
  page,
  api,
}) => {
  const id = uid();
  const ramen = await api.createShop({
    name: `${id} 煮干しそば`,
    eaten: true,
    rate: 60,
  });
  const udon = await api.createShop({
    name: `${id} 釜玉うどん`,
    category: "udon",
  });

  await page.goto("/search");
  await expect(page.getByRole("complementary")).toBeHidden();

  const countLabel = (n: number) =>
    page.getByText(new RegExp(`^${n}\\s*件 / SHOPS$`));
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

  const sheetBottom = async () => {
    const bounds = await page
      .locator(".react-modal-sheet-container")
      .boundingBox();
    return bounds === null ? 0 : bounds.y + bounds.height;
  };
  await expect.poll(sheetBottom).toBeCloseTo(page.viewportSize()!.height, 0);

  await page.getByText(ramen.name, { exact: true }).click();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
  await expect.poll(sheetBottom).toBeCloseTo(page.viewportSize()!.height, 0);
  await expect(page.getByText(udon.name)).toHaveCount(0);
});

test("guest opens a shared shop URL in the mobile sheet", async ({
  page,
  api,
}) => {
  const shop = await api.createShop({ name: `${uid()} 共有まぜそば` });

  await page.goto(`/search?shop=${shop.id}`);
  // The desktop detail panel is in the DOM too, hidden by a media query.
  await expect(
    page.getByText(shop.name, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "閉じる" })).toBeVisible();
});

test("guest scrolls details without dismissal and pulls down from the top", async ({
  page,
  api,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  const shop = await api.createShop({
    name: `${uid()} 訪問履歴のある店舗`,
    address: "東京都新宿区新宿１丁目１６−１０ カテリーナ・ネオハイツ 103",
    eaten: true,
    rate: 85,
  });
  await api.updateShop(shop, {
    links: Array.from({ length: 10 }, (_, i) => ({
      type: "other",
      url: `https://example.com/shop/${i}`,
      label: `店舗リンク ${i + 1} の詳しい情報を確認する`,
    })),
  });

  for (const height of [640, 844]) {
    await page.emulateMedia({
      reducedMotion: height === 844 ? "reduce" : "no-preference",
    });
    await page.setViewportSize({ width: 390, height });
    await page.goto(`/search?shop=${shop.id}`);
    const header = page.locator(".react-modal-sheet-header-container");
    await expect(header).toBeVisible();
    const handle = await header.boundingBox();
    expect(handle).not.toBeNull();
    await page.mouse.move(195, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(195, height * 0.12, { steps: 30 });
    await page.mouse.up();

    const scroller = page.locator(".react-modal-sheet-content-scroller");
    const share = scroller.getByRole("button", { name: "共有" });
    await expect(share).toBeVisible();
    await expect(scroller).toHaveCSS("overflow-y", "auto");
    await expect
      .poll(async () => {
        const bounds = await page
          .locator(".react-modal-sheet-container")
          .boundingBox();
        return bounds === null ? 0 : bounds.y + bounds.height;
      })
      .toBeCloseTo(height, 0);
    await expect
      .poll(async () => {
        await scroller.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        const bounds = await share.boundingBox();
        return (
          bounds !== null && bounds.y >= 0 && bounds.y + bounds.height <= height
        );
      })
      .toBe(true);
    await expect(
      scroller.getByRole("link", { name: "Google Maps", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      scroller
        .getByRole("link", { name: "Google Maps", exact: true })
        .locator('svg[aria-hidden="true"]'),
    ).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath(`maps-actions-${height}.png`),
    });

    const touch = await page.context().newCDPSession(page);
    const swipe = async (positions: number[]) => {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 375, y: positions[0], id: 1 }],
      });
      for (const y of positions.slice(1)) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 375, y, id: 1 }],
        });
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => resolve());
            }),
        );
      }
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };

    const expandedTop = (await header.boundingBox())!.y;
    await swipe([
      250, 270, 290, 310, 330, 350, 370, 390, 410, 430, 410, 390, 370, 350, 330,
    ]);
    await expect(share).toBeVisible();
    await expect
      .poll(async () => (await header.boundingBox())?.y)
      .toBeCloseTo(expandedTop, 0);

    const scrollStart = await scroller.evaluate((el) => el.scrollTop);
    await swipe([500, 480, 460, 440, 420, 400, 380, 360, 340, 320, 300]);
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(scrollStart);
    await expect(share).toBeVisible();

    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(scroller).toHaveCSS("touch-action", "pan-down");
    const boundaryGestures = await scroller.evaluate((el) => {
      const target = el.firstElementChild;
      if (!target) throw new Error("Shop detail content is missing");
      const dispatch = (type: string, y: number) => {
        const touch = new Touch({
          identifier: 1,
          target,
          pageX: 375,
          pageY: y,
        });
        return target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
          }),
        );
      };
      dispatch("touchstart", 250);
      const downwardScrollAllowed = dispatch("touchmove", 270);
      dispatch("touchend", 270);
      dispatch("touchstart", 250);
      const upwardScrollAllowed = dispatch("touchmove", 230);
      dispatch("touchend", 230);
      return { downwardScrollAllowed, upwardScrollAllowed };
    });
    expect(boundaryGestures).toEqual({
      downwardScrollAllowed: false,
      upwardScrollAllowed: true,
    });
    await swipe([
      250, 270, 290, 310, 330, 350, 370, 390, 410, 430, 450, 470, 490, 510, 530,
      550,
    ]);
    await expect
      .poll(async () => (await header.boundingBox())?.y ?? 0)
      .toBeGreaterThan(height * 0.7);
    await expect(share).toBeAttached();
    await expect(share).not.toBeInViewport();

    // Grabbing the sheet while its snap animation still runs leaves it collapsed.
    let previousY: number | undefined;
    await expect
      .poll(
        async () => {
          const y = (await header.boundingBox())?.y;
          const settled = y !== undefined && y === previousY;
          previousY = y;
          return settled;
        },
        { intervals: [100] },
      )
      .toBe(true);
    const collapsed = await header.boundingBox();
    await page.mouse.move(195, collapsed!.y + collapsed!.height / 2);
    await page.mouse.down();
    await page.mouse.move(195, 35, { steps: 30 });
    await page.mouse.up();
    await expect(scroller).toHaveCSS("overflow-y", "auto");
    await expect
      .poll(async () => (await header.boundingBox())?.y ?? height)
      .toBeLessThan(height * 0.1);
    await expect(share).toBeAttached();
    await touch.detach();
  }
});
