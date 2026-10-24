import { japanDate } from "@/features/visits/visit-date.ts";
import { describe, expect, it } from "vitest";

describe("japanDate", () => {
  it("turns the date at midnight in Japan, whatever the browser's zone", () => {
    expect(japanDate(new Date("2023-04-01T14:59:59Z"))).toBe("2023-04-01");
    expect(japanDate(new Date("2023-04-01T15:00:00Z"))).toBe("2023-04-02");
  });
});
