import {
  isHttpUrl,
  SHOP_LINK_TYPES,
  ShopLinkType,
} from "@/features/shops/shop-links.ts";
import { err, ok, Result } from "@/utils/result.ts";

const REVIEW_REASONS = [
  "high_impact_field",
  "replaces_existing_value",
  "link_needs_review",
  "source_unconfirmed",
  "estimated_reading",
  "suspected_injection",
  "identity_uncertain",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

const SOURCE_KINDS = [
  "official_site",
  "official_sns",
  "facility_site",
  "tabelog",
  "reservation_site",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

const NOTICE_KINDS = [
  "address_differs",
  "possibly_relocated",
  "possibly_closed",
  "closed_without_date",
  "multiple_candidates",
  "suspected_injection",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

const OUTCOMES = ["found", "no_evidence", "error"] as const;
export type CheckOutcome = (typeof OUTCOMES)[number];

export type Evidence = {
  readonly url: string;
  readonly sourceKind: SourceKind;
  readonly observedAt: string;
  readonly note: string;
};
export type ClosureValue = {
  readonly startsOn: string;
  readonly reopensOn: string | null;
};
export type LinkValue = {
  readonly type: ShopLinkType;
  readonly url: string;
  readonly label: string | null;
};

type ProposalBase = {
  readonly id: string;
  readonly shopId: string;
  readonly evidence: readonly Evidence[];
  readonly estimated: boolean;
  readonly reviewReasons: readonly ReviewReason[];
};
export type Proposal = ProposalBase &
  (
    | {
        readonly field: "name" | "name_kana" | "opened_at" | "closed_at";
        readonly baseValue: string | null;
        readonly proposedValue: string;
      }
    | {
        readonly field: "temporary_closure";
        readonly baseValue: ClosureValue | null;
        readonly proposedValue: ClosureValue;
      }
    // Links and tags are additions, so they have no base value to conflict on.
    | {
        readonly field: "link";
        readonly baseValue: null;
        readonly proposedValue: LinkValue;
      }
    | {
        readonly field: "tag";
        readonly baseValue: null;
        readonly proposedValue: string;
      }
  );
export type ProposalField = Proposal["field"];

export type Notice = {
  readonly shopId: string;
  readonly kind: NoticeKind;
  readonly note: string;
  readonly url: string | null;
};

export type EnrichmentFile = {
  readonly runId: string;
  readonly proposals: readonly Proposal[];
  readonly notices: readonly Notice[];
  readonly checks: Readonly<Record<CheckOutcome, number>>;
  /** Trait labels no tag covers, most frequent first. */
  readonly tagCandidates: readonly {
    readonly label: string;
    readonly count: number;
  }[];
};

class FileProblem extends Error {}
const problem = (message: string): never => {
  throw new FileProblem(message);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A real YYYY-MM-DD. The server stores an unparsable date as "no date", so one must never reach it. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function record(value: unknown, required: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return problem("形式が正しくありません");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== required.length ||
    !required.every((key) => keys.includes(key))
  ) {
    return problem("項目の構成が正しくありません");
  }
  return value as Record<string, unknown>;
}

function nullable<T>(value: unknown, parse: (raw: unknown) => T) {
  return value === null ? null : parse(value);
}

const text = (value: unknown): string =>
  typeof value === "string" && value.trim() !== ""
    ? value
    : problem("文字列が正しくありません");

const url = (value: unknown): string =>
  typeof value === "string" && isHttpUrl(value)
    ? value
    : problem("URL が正しくありません");

const date = (value: unknown): string =>
  isCalendarDate(value) ? value : problem("日付が正しくありません");

const shopId = (value: unknown): string =>
  typeof value === "string" && UUID.test(value)
    ? value
    : problem("店舗 ID が正しくありません");

function oneOf<const T extends string>(allowed: readonly T[], value: unknown) {
  return allowed.includes(value as T)
    ? (value as T)
    : problem("未知の種類が含まれています");
}

function closure(value: unknown): ClosureValue {
  const raw = record(value, ["startsOn", "reopensOn"]);
  return {
    startsOn: date(raw.startsOn),
    reopensOn: nullable(raw.reopensOn, date),
  };
}

function link(value: unknown): LinkValue {
  const raw = record(value, ["type", "url", "label"]);
  return {
    type: oneOf(SHOP_LINK_TYPES, raw.type),
    url: url(raw.url),
    label: nullable(raw.label, text),
  };
}

function evidence(value: unknown): Evidence {
  const raw = record(value, ["url", "sourceKind", "observedAt", "note"]);
  return {
    url: url(raw.url),
    sourceKind: oneOf(SOURCE_KINDS, raw.sourceKind),
    observedAt: date(raw.observedAt),
    note: text(raw.note),
  };
}

function proposalValues(
  field: unknown,
  base: unknown,
  proposed: unknown,
): Pick<Proposal, "field" | "baseValue" | "proposedValue"> {
  const nothing = (value: unknown) =>
    value === null ? null : problem("追加の提案に現在の値があります");
  switch (field) {
    case "name":
    case "name_kana":
      return {
        field,
        baseValue: nullable(base, text),
        proposedValue: text(proposed),
      } as Proposal;
    case "opened_at":
    case "closed_at":
      return {
        field,
        baseValue: nullable(base, date),
        proposedValue: date(proposed),
      } as Proposal;
    case "temporary_closure":
      return {
        field,
        baseValue: nullable(base, closure),
        proposedValue: closure(proposed),
      } as Proposal;
    case "link":
      return {
        field,
        baseValue: nothing(base),
        proposedValue: link(proposed),
      } as Proposal;
    case "tag":
      return {
        field,
        baseValue: nothing(base),
        proposedValue: text(proposed),
      } as Proposal;
    default:
      return problem("未知の項目が含まれています");
  }
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : problem("一覧の形式が正しくありません");
}

/**
 * Reads `accepted.jsonl` from validate-results.mjs. The file holds web-derived text and came from
 * outside this app, so one malformed line refuses the whole file rather than applying part of it.
 */
export function parseEnrichmentFile(
  content: string,
): Result<EnrichmentFile, string> {
  const proposals = new Map<string, Proposal>();
  const notices: Notice[] = [];
  const checks: Record<CheckOutcome, number> = {
    found: 0,
    no_evidence: 0,
    error: 0,
  };
  const candidates = new Map<string, number>();
  const runIds = new Set<string>();
  const singleValues = new Set<string>();

  const lines = content.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return err(`${i + 1} 行目: JSON として読めません`);
      }
      const kind = (parsed as { kind?: unknown } | null)?.kind;
      switch (kind) {
        case "proposal": {
          const raw = record(parsed, [
            "kind",
            "runId",
            "shopId",
            "field",
            "baseValue",
            "proposedValue",
            "evidence",
            "estimated",
            "reviewReasons",
            "dedupeKey",
          ]);
          if (typeof raw.estimated !== "boolean") {
            problem("推定の印が正しくありません");
          }
          runIds.add(text(raw.runId));
          const id = text(raw.dedupeKey);
          // One PUT can hold one value of these, so a second would replace the first unseen.
          const singleValue = `${String(raw.shopId)}/${String(raw.field)}`;
          if (raw.field !== "link" && raw.field !== "tag") {
            if (!proposals.has(id) && singleValues.has(singleValue)) {
              problem("同じ項目に複数の値があります");
            }
            singleValues.add(singleValue);
          }
          proposals.set(id, {
            id,
            shopId: shopId(raw.shopId),
            estimated: raw.estimated as boolean,
            evidence: list(raw.evidence).map(evidence),
            reviewReasons: list(raw.reviewReasons).map((reason) =>
              oneOf(REVIEW_REASONS, reason),
            ),
            ...proposalValues(raw.field, raw.baseValue, raw.proposedValue),
          } as Proposal);
          break;
        }
        case "notice": {
          const raw = record(parsed, [
            "kind",
            "runId",
            "shopId",
            "noticeKind",
            "note",
            "url",
          ]);
          runIds.add(text(raw.runId));
          notices.push({
            shopId: shopId(raw.shopId),
            kind: oneOf(NOTICE_KINDS, raw.noticeKind),
            note: text(raw.note),
            url: nullable(raw.url, url),
          });
          break;
        }
        case "check": {
          const raw = record(parsed, [
            "kind",
            "runId",
            "shopId",
            "field",
            "outcome",
            "checkedAt",
          ]);
          runIds.add(text(raw.runId));
          shopId(raw.shopId);
          text(raw.field);
          date(raw.checkedAt);
          checks[oneOf(OUTCOMES, raw.outcome)] += 1;
          break;
        }
        case "tag_candidate": {
          const raw = record(parsed, ["kind", "runId", "shopId", "label"]);
          runIds.add(text(raw.runId));
          shopId(raw.shopId);
          const label = text(raw.label);
          candidates.set(label, (candidates.get(label) ?? 0) + 1);
          break;
        }
        default:
          return problem("未知のレコードです");
      }
    } catch (error) {
      if (error instanceof FileProblem) {
        return err(`${i + 1} 行目: ${error.message}`);
      }
      throw error;
    }
  }

  if (runIds.size === 0) {
    return err("レコードがありません");
  }
  if (runIds.size > 1) {
    return err("複数の実行の結果が混ざっています");
  }
  return ok({
    runId: [...runIds][0],
    proposals: [...proposals.values()],
    notices,
    checks,
    tagCandidates: [...candidates]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  });
}
