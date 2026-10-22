import { shopShareUrl } from "@/utils/path.ts";
import { describe, expect, it } from "vitest";

describe("shopShareUrl", () => {
  it("links to the shop's share page on this origin", () => {
    expect(shopShareUrl("0f8e5d0c-1111-4222-8333-444455556666")).toBe(
      `${location.origin}/r/0f8e5d0c-1111-4222-8333-444455556666`,
    );
  });

  it("encodes the id as one path segment", () => {
    expect(shopShareUrl("a/b?c")).toBe(`${location.origin}/r/a%2Fb%3Fc`);
  });
});
