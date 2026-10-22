import {
  displayableShopLinks,
  inferShopLinkType,
  isHttpUrl,
  type ShopLink,
  shopLinkText,
  withLinkUrl,
} from "@/features/shops/shop-links.ts";
import { describe, expect, it } from "vitest";

describe("isHttpUrl", () => {
  it.each([
    "https://a.example",
    "HTTP://A.EXAMPLE/",
    "https://らーめん.jp/",
    "https://my_shop.example/",
    "https://a.example:8080/x",
    "https://a.example/a|b%zz c#a#b",
    "https://a.example/ラーメン",
  ])("accepts %s", (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://a.example/",
    "a.example",
    "https://",
    "https://user@a.example/",
    "https://user:pass@a.example/",
    "https://a.example:0/",
    "https://a.example:65536/",
    "https://a b.example/",
  ])("rejects %s", (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});

describe("inferShopLinkType", () => {
  it.each([
    ["https://x.com/menya", "twitter"],
    ["https://twitter.com/menya", "twitter"],
    ["https://mobile.twitter.com/menya", "twitter"],
    ["https://www.instagram.com/menya/", "instagram"],
    ["https://instagram.com/menya", "instagram"],
    ["https://www.facebook.com/menya", "facebook"],
    ["https://m.facebook.com/menya", "facebook"],
    ["https://fb.com/menya", "facebook"],
    ["https://tabelog.com/tokyo/A1304/A130401/13000000/", "tabelog"],
    ["  HTTPS://X.COM/menya  ", "twitter"],
    ["https://menya.example/", "other"],
    ["https://notx.com/", "other"],
    ["https://x.com.evil.example/", "other"],
    ["x.com/menya", "other"],
    ["javascript:alert(1)", "other"],
    ["", "other"],
  ] as const)("%s -> %s", (url, type) => {
    expect(inferShopLinkType(url)).toBe(type);
  });
});

describe("withLinkUrl", () => {
  it("follows the URL while the type matches what the URL implied", () => {
    const typed = withLinkUrl({ type: "other", url: "" }, "https://x.com/a");
    expect(typed).toEqual({ type: "twitter", url: "https://x.com/a" });
    expect(withLinkUrl(typed, "https://a.example/")).toEqual({
      type: "other",
      url: "https://a.example/",
    });
  });

  it("keeps a type the admin picked", () => {
    expect(
      withLinkUrl(
        { type: "official", url: "https://a.example/" },
        "https://x.com/a",
      ),
    ).toEqual({ type: "official", url: "https://x.com/a" });
  });
});

describe("shopLinkText", () => {
  it("prefers the label, then the type name", () => {
    expect(
      shopLinkText({ type: "twitter", label: "本店", url: "https://x.com/a" }),
    ).toBe("本店");
    expect(shopLinkText({ type: "twitter", url: "https://x.com/a" })).toBe(
      "Twitter",
    );
    expect(shopLinkText({ type: "official", url: "https://a.example/" })).toBe(
      "公式サイト",
    );
    expect(shopLinkText({ type: "tabelog", label: "", url: "https://t" })).toBe(
      "食べログ",
    );
    // A type added by a newer server than this build.
    expect(
      shopLinkText({ type: "tiktok", url: "https://t" } as unknown as ShopLink),
    ).toBe("その他");
  });
});

describe("displayableShopLinks", () => {
  it("keeps only http(s) URLs and tolerates a missing list", () => {
    const ok = { type: "other", url: "http://a.example/" } as const;
    const secure = { type: "official", url: "https://b.example/" } as const;
    expect(
      displayableShopLinks([
        ok,
        { type: "other", url: "javascript:alert(1)" },
        { type: "other", url: "data:text/html,hi" },
        { type: "other", url: "not a url" },
        secure,
      ]),
    ).toEqual([ok, secure]);
    expect(displayableShopLinks(undefined)).toEqual([]);
  });
});
