import { shareShop } from "@/features/shops/shop-actions.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shop = makeShop({ name: "中華そば 青葉" });

function stubNavigator(stubs: {
  share?: Navigator["share"];
  writeText: Clipboard["writeText"];
}) {
  Object.defineProperty(navigator, "share", {
    value: stubs.share,
    configurable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: stubs.writeText },
    configurable: true,
  });
}

describe("shareShop", () => {
  const writeText = vi.fn<Clipboard["writeText"]>();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    renderWithProviders(null);
  });

  afterEach(() => {
    stubNavigator({ share: undefined, writeText });
  });

  // The toaster store is a module singleton, so no-toast cases run first.
  it("opens the native share sheet when available", async () => {
    const share = vi.fn<Navigator["share"]>().mockResolvedValue(undefined);
    stubNavigator({ share, writeText });

    await act(() => shareShop(shop));

    expect(share).toHaveBeenCalledWith({
      title: "中華そば 青葉",
      url: `${location.origin}/search?shop=${shop.id}`,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does nothing when the share sheet is cancelled", async () => {
    const share = vi
      .fn<Navigator["share"]>()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    stubNavigator({ share, writeText });

    await act(() => shareShop(shop));

    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("URLをコピーしました")).not.toBeInTheDocument();
  });

  it("copies the URL when sharing is unsupported", async () => {
    stubNavigator({ writeText });

    await act(() => shareShop(shop));

    expect(writeText).toHaveBeenCalledWith(
      `${location.origin}/search?shop=${shop.id}`,
    );
    expect(await screen.findByText("URLをコピーしました")).toBeInTheDocument();
  });

  it("shows an error when copying fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    stubNavigator({ writeText });

    await act(() => shareShop(shop));

    expect(
      await screen.findByText("URLをコピーできませんでした"),
    ).toBeInTheDocument();
  });
});
