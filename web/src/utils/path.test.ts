import { shopShareUrl } from "@/utils/path.ts";
import { describe, expect, it } from "vitest";

describe("shopShareUrl", () => {
  it("links to the search page with the shop selected", () => {
    const url = new URL(shopShareUrl("0f8e5d0c-1111-4222-8333-444455556666"));

    expect(url.origin).toBe(location.origin);
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("shop")).toBe(
      "0f8e5d0c-1111-4222-8333-444455556666",
    );
  });
});
