import { toaster } from "@/components/ui/toaster.tsx";
import {
  buildGoogleMapsUrl,
  shareShop,
} from "@/features/shops/shop-actions.tsx";
import { makeShop } from "@/test/fixtures.ts";
import { renderWithProviders } from "@/test/render.tsx";
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shop = makeShop({ name: "中華そば 青葉" });
const shareUrl = () => `${location.origin}/r/${shop.id}`;

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

function stubPointer(coarse: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: coarse && query === "(pointer: coarse)",
      }) as MediaQueryList,
  );
}

describe("buildGoogleMapsUrl", () => {
  it("searches by name and address alone for a shop without a Place ID", () => {
    const url = new URL(
      buildGoogleMapsUrl(
        makeShop({ name: "麺屋", address: "東京都", googlePlaceId: undefined }),
      ),
    );

    expect(url.searchParams.get("query")).toBe("麺屋 東京都");
    expect(url.searchParams.has("query_place_id")).toBe(false);
  });
});

describe("shareShop", () => {
  const writeText = vi.fn<Clipboard["writeText"]>();
  const share = vi.fn<Navigator["share"]>();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    share.mockReset().mockResolvedValue(undefined);
    stubNavigator({ share, writeText });
    renderWithProviders(null);
  });

  afterEach(() => {
    act(() => {
      toaster.remove();
    });
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
  });

  it("opens the native share sheet on touch devices", async () => {
    stubPointer(true);

    await act(() => shareShop(shop));

    expect(share).toHaveBeenCalledWith({
      title: "中華そば 青葉",
      url: shareUrl(),
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does nothing when the share sheet is cancelled", async () => {
    stubPointer(true);
    share.mockRejectedValue(new DOMException("cancelled", "AbortError"));

    await act(() => shareShop(shop));

    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an error when sharing fails", async () => {
    stubPointer(true);
    share.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    await act(() => shareShop(shop));

    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText("共有できませんでした")).toBeInTheDocument();
  });

  it("copies the URL on non-touch devices even when sharing exists", async () => {
    stubPointer(false);

    await act(() => shareShop(shop));

    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(shareUrl());
    expect(await screen.findByText("URLをコピーしました")).toBeInTheDocument();
  });

  it("copies the URL when sharing is unsupported", async () => {
    stubPointer(true);
    stubNavigator({ writeText });

    await act(() => shareShop(shop));

    expect(writeText).toHaveBeenCalledWith(shareUrl());
    expect(await screen.findByText("URLをコピーしました")).toBeInTheDocument();
  });

  it("shows an error when copying fails", async () => {
    stubPointer(false);
    writeText.mockRejectedValue(new Error("denied"));

    await act(() => shareShop(shop));

    expect(
      await screen.findByText("URLをコピーできませんでした"),
    ).toBeInTheDocument();
  });
});
