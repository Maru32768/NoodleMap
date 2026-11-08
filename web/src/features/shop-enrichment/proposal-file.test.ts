import {
  isCalendarDate,
  parseEnrichmentFile,
} from "@/features/shop-enrichment/proposal-file.ts";
import { describe, expect, it } from "vitest";

const SHOP_ID = "11111111-2222-4333-8444-555555555555";
const evidence = {
  url: "https://toho-seiso.example/news",
  sourceKind: "official_site",
  observedAt: "2026-11-06",
  note: "開店のお知らせ",
};
const proposal = {
  kind: "proposal",
  runId: "b07-2026-11-06",
  shopId: SHOP_ID,
  field: "opened_at",
  baseValue: null,
  proposedValue: "2020-06-28",
  evidence: [evidence],
  estimated: false,
  reviewReasons: [],
  dedupeKey: "key-1",
};
const lines = (...records: unknown[]) =>
  records.map((record) => JSON.stringify(record)).join("\n");
const parse = (...records: unknown[]) => parseEnrichmentFile(lines(...records));
const errorOf = (...records: unknown[]) => {
  const result = parse(...records);
  if (result.ok) {
    throw new Error("expected a refusal");
  }
  return result.error;
};

describe("parseEnrichmentFile", () => {
  it("reads every kind of record", () => {
    const result = parseEnrichmentFile(
      lines(
        proposal,
        {
          kind: "notice",
          runId: proposal.runId,
          shopId: SHOP_ID,
          noticeKind: "address_differs",
          note: "番地が異なる",
          url: null,
        },
        {
          kind: "check",
          runId: proposal.runId,
          shopId: SHOP_ID,
          field: "opened_at",
          outcome: "found",
          checkedAt: "2026-11-06",
        },
        {
          kind: "tag_candidate",
          runId: proposal.runId,
          shopId: SHOP_ID,
          label: "鶏清湯",
        },
      ) + "\r\n\r\n",
    );
    expect(result.ok && result.data).toMatchObject({
      runId: proposal.runId,
      proposals: [
        { id: "key-1", field: "opened_at", proposedValue: "2020-06-28" },
      ],
      notices: [{ kind: "address_differs", url: null }],
      checks: { found: 1, no_evidence: 0, error: 0 },
      tagCandidates: [{ label: "鶏清湯", count: 1 }],
    });
  });

  it.each([
    ["an unknown key", { ...proposal, autoApprove: true }],
    ["a missing key", { ...proposal, evidence: undefined }],
    ["an unknown field", { ...proposal, field: "rate" }],
    ["an unknown record kind", { ...proposal, kind: "command" }],
    ["an unknown review reason", { ...proposal, reviewReasons: ["trust_me"] }],
    ["a malformed shop id", { ...proposal, shopId: "not-a-shop" }],
    ["an impossible date", { ...proposal, proposedValue: "2026-02-30" }],
    [
      "a script link",
      {
        ...proposal,
        field: "link",
        proposedValue: {
          type: "official",
          url: "javascript:alert(1)",
          label: null,
        },
      },
    ],
    [
      "a script evidence link",
      { ...proposal, evidence: [{ ...evidence, url: "javascript:alert(1)" }] },
    ],
    [
      "a link claiming a base value",
      {
        ...proposal,
        field: "link",
        baseValue: "https://example.com/",
        proposedValue: {
          type: "official",
          url: "https://example.com/",
          label: null,
        },
      },
    ],
  ])("refuses the whole file for %s, naming the line", (_name, bad) => {
    expect(errorOf(proposal, bad)).toMatch(/^2 行目: /);
  });

  it("reads 営業時間 with the API's base value and a proposal that carries its 確認日", () => {
    const tuesday = {
      day: "tue",
      periods: [{ opensAt: "18:00", closesAt: "26:00" }],
      closedWeeks: [2],
    };
    const hours = {
      ...proposal,
      field: "business_hours",
      // The batch copies the API shape, which leaves out an unset note and 確認日.
      baseValue: { kind: "irregular", days: [] },
      proposedValue: {
        kind: "weekly",
        days: [tuesday],
        note: "売り切れ次第終了",
        checkedOn: "2026-11-05",
      },
    };
    const result = parse(hours);
    expect(result.ok && result.data.proposals[0]).toMatchObject({
      field: "business_hours",
      baseValue: { kind: "irregular", days: [] },
      proposedValue: {
        days: [tuesday],
        note: "売り切れ次第終了",
        checkedOn: "2026-11-05",
      },
    });

    const { checkedOn: _, ...withoutDate } = hours.proposedValue;
    expect(errorOf({ ...hours, proposedValue: withoutDate })).toBe(
      "1 行目: 確認日がありません",
    );
    const badTime = {
      ...hours.proposedValue,
      days: [{ ...tuesday, periods: [{ opensAt: "9:00", closesAt: "15:00" }] }],
    };
    expect(errorOf({ ...hours, proposedValue: badTime })).toBe(
      "1 行目: 時刻が正しくありません",
    );
  });

  it("refuses text that is not JSON, and an empty file", () => {
    const notJson = parseEnrichmentFile("{not json");
    expect(!notJson.ok && notJson.error).toBe("1 行目: JSON として読めません");
    const empty = parseEnrichmentFile("\n");
    expect(!empty.ok && empty.error).toBe("レコードがありません");
  });

  it("refuses two runs mixed in one file", () => {
    expect(
      errorOf(proposal, {
        ...proposal,
        field: "closed_at",
        runId: "b08-2026-11-06",
        dedupeKey: "2",
      }),
    ).toBe("複数の実行の結果が混ざっています");
  });

  it("refuses two values for a field a shop holds once", () => {
    expect(
      errorOf(proposal, {
        ...proposal,
        proposedValue: "2021-01-01",
        dedupeKey: "key-2",
      }),
    ).toBe("2 行目: 同じ項目に複数の値があります");
  });

  it("orders tag candidates by how many shops named them", () => {
    const candidate = (label: string, shopId = SHOP_ID) => ({
      kind: "tag_candidate",
      runId: "r",
      shopId,
      label,
    });
    const result = parse(
      candidate("煮干し"),
      candidate("鶏清湯"),
      candidate("鶏清湯"),
    );
    expect(result.ok && result.data.tagCandidates).toEqual([
      { label: "鶏清湯", count: 2 },
      { label: "煮干し", count: 1 },
    ]);
  });
});

describe("isCalendarDate", () => {
  it("accepts only real dates", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isCalendarDate("2024-2-9")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});
