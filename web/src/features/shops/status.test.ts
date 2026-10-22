import {
  DEFAULT_SYSTEM_TAG_SELECTION,
  formatShopDate,
  isSystemTagSlug,
  parseShopDate,
  shopDisplaySystemTags,
  shopEatenStatus,
  shopLifecycleStatus,
  shopRecencyStatus,
  shopSystemTagSlugs,
} from "@/features/shops/status.ts";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

// Mid-afternoon so day-granularity comparisons can't pass by accident.
const now = dayjs("2025-06-15T15:30:00");

function dated(openedAt?: string, closedAt?: string) {
  return {
    openedAtDate: parseShopDate(openedAt),
    closedAtDate: parseShopDate(closedAt),
  };
}

describe("parseShopDate", () => {
  it("parses a YYYY-MM-DD date to local midnight", () => {
    const parsed = parseShopDate("2025-01-05");

    expect(parsed?.format("YYYY-MM-DD HH:mm:ss")).toBe("2025-01-05 00:00:00");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["month 13", "2025-13-01"],
    ["Feb 30", "2025-02-30"],
    ["slash separated", "2025/01/05"],
    ["datetime", "2025-01-05T10:00:00"],
    ["garbage", "soon"],
  ])("rejects %s input", (_, value) => {
    expect(parseShopDate(value)).toBeNull();
  });
});

describe("formatShopDate", () => {
  it("formats without zero padding", () => {
    expect(formatShopDate("2025-01-05")).toBe("2025/1/5");
  });

  it("returns null for missing or invalid dates", () => {
    expect(formatShopDate(undefined)).toBeNull();
    expect(formatShopDate("2025-02-30")).toBeNull();
  });
});

describe("shopLifecycleStatus", () => {
  it.each([
    ["open with no dates", undefined, undefined, "open"],
    ["open after opening", "2025-06-15", undefined, "open"],
    ["upcoming before opening", "2025-06-16", undefined, "upcoming"],
    ["closingSoon before closing", undefined, "2025-06-16", "closingSoon"],
    ["closed on the closing day", undefined, "2025-06-15", "closed"],
    ["closed after closing", undefined, "2025-01-01", "closed"],
    ["upcoming over closingSoon", "2025-07-01", "2025-08-01", "upcoming"],
    ["closed over upcoming", "2025-07-01", "2025-06-01", "closed"],
  ] as const)("is %s", (_, openedAt, closedAt, expected) => {
    expect(shopLifecycleStatus(dated(openedAt, closedAt), now)).toBe(expected);
  });
});

describe("shopRecencyStatus", () => {
  it.each([
    ["regular without an opening date", undefined, undefined, "regular"],
    ["regular before opening", "2025-06-16", undefined, "regular"],
    ["new on opening day", "2025-06-15", undefined, "new"],
    ["new 365 days after opening", "2024-06-15", undefined, "new"],
    ["regular 366 days after opening", "2024-06-14", undefined, "regular"],
    ["regular once closed", "2025-06-01", "2025-06-10", "regular"],
    ["new while closing soon", "2025-06-01", "2025-07-01", "new"],
  ] as const)("is %s", (_, openedAt, closedAt, expected) => {
    expect(shopRecencyStatus(dated(openedAt, closedAt), now)).toBe(expected);
  });
});

describe("shopEatenStatus", () => {
  it("maps the eaten flag", () => {
    expect(shopEatenStatus({ eaten: true })).toBe("eaten");
    expect(shopEatenStatus({ eaten: false })).toBe("uneaten");
  });
});

describe("system tags", () => {
  it("recognizes system slugs and nothing else", () => {
    expect(isSystemTagSlug("system:closed")).toBe(true);
    expect(isSystemTagSlug("system:unknown")).toBe(false);
    expect(isSystemTagSlug("00000000-0000-4000-8000-000000000001")).toBe(false);
  });

  it("selects every status except closed by default", () => {
    expect([...DEFAULT_SYSTEM_TAG_SELECTION].sort()).toEqual([
      "system:closingSoon",
      "system:new",
      "system:open",
      "system:upcoming",
    ]);
  });

  it("gives a shop its lifecycle tag plus the new flag", () => {
    expect(
      shopSystemTagSlugs({ lifecycleStatus: "open", recencyStatus: "new" }),
    ).toEqual(["system:open", "system:new"]);
    expect(
      shopSystemTagSlugs({
        lifecycleStatus: "closed",
        recencyStatus: "regular",
      }),
    ).toEqual(["system:closed"]);
  });

  it("hides the default open state from shop chips", () => {
    const labels = (
      lifecycleStatus: "open" | "closingSoon",
      recencyStatus: "new" | "regular",
    ) =>
      shopDisplaySystemTags({ lifecycleStatus, recencyStatus }).map(
        (tag) => tag.label,
      );

    expect(labels("open", "regular")).toEqual([]);
    expect(labels("open", "new")).toEqual(["新店"]);
    expect(labels("closingSoon", "new")).toEqual(["新店", "閉店予定"]);
  });
});
