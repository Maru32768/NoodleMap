import { uploadTimeoutMs } from "@/features/meal-records/api/use-meal-record-images.ts";
import { describe, expect, it } from "vitest";

describe("uploadTimeoutMs", () => {
  it("allows 30 s plus 50 KB/s of the file", () => {
    expect(uploadTimeoutMs(0)).toBe(30_000);
    expect(uploadTimeoutMs(15 * 1024 * 1024)).toBe(30_000 + 307_200);
  });
});
