import type { Shop } from "@/features/shops/api/use-shops.ts";
import {
  shopClosureStatus,
  shopLifecycleStatus,
} from "@/features/shops/status.ts";
import type { components } from "@/generated/api.ts";
import holidayJp from "@holiday-jp/holiday_jp";
import dayjs, { Dayjs } from "dayjs";

export type BusinessHours = components["schemas"]["BusinessHours"];
export type BusinessDay = components["schemas"]["BusinessDay"];
export type BusinessDayHours = components["schemas"]["BusinessDayHours"];
export type BusinessPeriod = components["schemas"]["BusinessPeriod"];

export const BUSINESS_DAYS: readonly BusinessDay[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "holiday",
];

export const BUSINESS_DAY_LABEL: Record<BusinessDay, string> = {
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
  sat: "土",
  sun: "日",
  holiday: "祝",
};

// Indexed by dayjs's day(), which starts on Sunday.
const WEEKDAY_OF_DAY_INDEX: readonly BusinessDay[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

const STALE_AFTER_MONTHS = 12;
const NEXT_OPENING_SEARCH_DAYS = 14;

type HoursShop = Pick<
  Shop,
  "businessHours" | "openedAtDate" | "closedAtDate" | "temporaryClosure"
>;

type Interval = { opens: Dayjs; closes: Dayjs };

/** Minutes after the business day's midnight; 26:00 is 1560. */
export function parseBusinessTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 「11:00〜15:00」, with a closing past midnight as 「翌2:00」. */
export function formatBusinessPeriod(period: BusinessPeriod): string {
  const closes = parseBusinessTime(period.closesAt);
  const closesLabel =
    closes > 24 * 60
      ? `翌${Math.floor(closes / 60) - 24}:${String(closes % 60).padStart(2, "0")}`
      : period.closesAt;
  return `${period.opensAt}〜${closesLabel}`;
}

// shortcut: the browser's local time stands for Japan time (GLOSSARY.md 営業中);
// switch to an Asia/Tokyo zone if viewers abroad need the shop's own clock.
export function isJapaneseHoliday(date: Dayjs): boolean {
  return holidayJp.isHoliday(date.toDate());
}

/** The row that applies to a business date: the 祝日 row on a 祝日 when the shop has one. */
export function rowForDate(
  hours: BusinessHours,
  date: Dayjs,
): BusinessDayHours | undefined {
  const holidayRow = hours.days.find((d) => d.day === "holiday");
  if (holidayRow && isJapaneseHoliday(date)) {
    return holidayRow;
  }
  const weekday = WEEKDAY_OF_DAY_INDEX[date.day()];
  return hours.days.find((d) => d.day === weekday);
}

function weekOfMonth(date: Dayjs): number {
  return Math.ceil(date.date() / 7);
}

function intervalsOn(hours: BusinessHours, date: Dayjs): Interval[] {
  const row = rowForDate(hours, date);
  if (!row || row.closedWeeks?.includes(weekOfMonth(date))) {
    return [];
  }
  return row.periods.map((p) => ({
    opens: date.add(parseBusinessTime(p.opensAt), "minute"),
    closes: date.add(parseBusinessTime(p.closesAt), "minute"),
  }));
}

// Opened, not yet closed, and not on 臨時休業 on that business date.
function servesOn(shop: HoursShop, date: Dayjs): boolean {
  const lifecycle = shopLifecycleStatus(shop, date);
  return (
    (lifecycle === "open" || lifecycle === "closingSoon") &&
    shopClosureStatus(shop, date) !== "temporarilyClosed"
  );
}

function weeklyHours(shop: HoursShop): BusinessHours | null {
  return shop.businessHours?.kind === "weekly" ? shop.businessHours : null;
}

/** The period the shop is open in at `at` (営業中), or null. A period past midnight belongs to the day it opened. */
export function openIntervalAt(shop: HoursShop, at: Dayjs): Interval | null {
  const hours = weeklyHours(shop);
  if (!hours) {
    return null;
  }
  const today = at.startOf("day");
  // Yesterday's period past midnight may overlap today's; the later closing is the one that holds.
  const open = [today.subtract(1, "day"), today]
    .filter((date) => servesOn(shop, date))
    .flatMap((date) => intervalsOn(hours, date))
    .filter((i) => !at.isBefore(i.opens) && at.isBefore(i.closes));
  return open.reduce<Interval | null>(
    (latest, i) => (latest && !i.closes.isAfter(latest.closes) ? latest : i),
    null,
  );
}

export function isOpenAt(shop: HoursShop, at: Dayjs): boolean {
  return openIntervalAt(shop, at) !== null;
}

/** When the shop next opens after `at`, within two weeks, or null. */
export function nextOpeningAfter(shop: HoursShop, at: Dayjs): Dayjs | null {
  const hours = weeklyHours(shop);
  if (!hours) {
    return null;
  }
  const today = at.startOf("day");
  for (let i = 0; i <= NEXT_OPENING_SEARCH_DAYS; i++) {
    const date = today.add(i, "day");
    if (!servesOn(shop, date)) {
      continue;
    }
    const next = intervalsOn(hours, date).find((p) => p.opens.isAfter(at));
    if (next) {
      return next.opens;
    }
  }
  return null;
}

/** The folded line of the 営業時間 section, e.g. 「営業中・15:00まで」. */
export function businessHoursHeadline(
  shop: Pick<Shop, "closureStatus"> & HoursShop,
  now: Dayjs = dayjs(),
): string {
  if (shop.closureStatus === "temporarilyClosed") {
    return "臨時休業";
  }
  if (!shop.businessHours) {
    return "営業時間不明";
  }
  if (shop.businessHours.kind === "irregular") {
    return "不定休";
  }
  const open = openIntervalAt(shop, now);
  if (open) {
    return `営業中・${open.closes.format("H:mm")}まで`;
  }
  const next = nextOpeningAfter(shop, now);
  if (!next) {
    return "営業時間外";
  }
  const day = next.isSame(now, "day")
    ? ""
    : next.diff(now.startOf("day"), "day") === 1
      ? "明日 "
      : `${BUSINESS_DAY_LABEL[WEEKDAY_OF_DAY_INDEX[next.day()]]} `;
  return `営業時間外・次は${day}${next.format("H:mm")}`;
}

/** One row of the unfolded list, e.g. 「11:00〜15:00、18:00〜翌2:00（第2・第4は休み）」. */
export function businessDayLabel(row: BusinessDayHours): string {
  if (row.periods.length === 0) {
    return "定休日";
  }
  const periods = row.periods.map(formatBusinessPeriod).join("、");
  const weeks = row.closedWeeks?.length
    ? `（${row.closedWeeks.map((w) => `第${w}`).join("・")}は休み）`
    : "";
  return periods + weeks;
}

/** The whole 営業時間 as lines of text, for comparing values side by side. */
export function businessHoursText(hours: BusinessHours): string {
  const schedule =
    hours.kind === "irregular"
      ? ["不定休"]
      : hours.days.map(
          (row) => `${BUSINESS_DAY_LABEL[row.day]} ${businessDayLabel(row)}`,
        );
  const checked = checkedOnLabel(hours);
  return [...schedule, hours.note, checked && `（${checked}）`]
    .filter(Boolean)
    .join("\n");
}

/** The row to highlight today: the 祝日 row on a 祝日 when the shop has one. */
export function todaysBusinessDay(
  hours: BusinessHours,
  now: Dayjs = dayjs(),
): BusinessDay | undefined {
  return rowForDate(hours, now.startOf("day"))?.day;
}

/** 「2026年11月確認」, or null when no 確認日 is recorded. */
export function checkedOnLabel(hours: BusinessHours): string | null {
  return hours.checkedOn
    ? `${dayjs(hours.checkedOn).format("YYYY年M月")}確認`
    : null;
}

/** True when the 確認日 is missing or more than a year old. */
export function isBusinessHoursStale(
  hours: BusinessHours,
  now: Dayjs = dayjs(),
): boolean {
  return (
    !hours.checkedOn ||
    dayjs(hours.checkedOn).add(STALE_AFTER_MONTHS, "month").isBefore(now, "day")
  );
}
