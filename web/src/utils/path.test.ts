import { shopShareUrl } from "@/utils/path.ts";
import { describe, expect, it } from "vitest";

describe("shopShareUrl", () => {
  it("links to the shop on this origin's search page", () => {
    expect(shopShareUrl("0f8e5d0c-1111-4222-8333-444455556666")).toBe(
      `${location.origin}/search?shop=0f8e5d0c-1111-4222-8333-444455556666`,
    );
  });

  it("encodes the id as one query value", () => {
    expect(shopShareUrl("a/b?c&d")).toBe(
      `${location.origin}/search?shop=a%2Fb%3Fc%26d`,
    );
  });
});
