import {
  SegmentedPicker,
  SegmentedToggles,
} from "@/components/segmented-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  BUSINESS_DAY_LABEL,
  BUSINESS_DAYS,
  BusinessDay,
  BusinessDayHours,
  BusinessHours,
  BusinessPeriod,
} from "@/features/shops/business-hours.ts";
import { Box, Input, Textarea } from "@chakra-ui/react";
import dayjs from "dayjs";

type Kind = BusinessHours["kind"] | "unknown";

const KIND_OPTIONS = [
  { id: "weekly", label: "通常" },
  { id: "irregular", label: "不定休" },
  { id: "unknown", label: "不明" },
] as const;

const WEEKS = ["1", "2", "3", "4", "5"] as const;
const WEEK_LABELS: Record<(typeof WEEKS)[number], string> = {
  "1": "第1",
  "2": "第2",
  "3": "第3",
  "4": "第4",
  "5": "第5",
};

const PERIODS_MAX = 4;
// Mirrors the server's NOTE_MAX_LENGTH (server/.../shops/BusinessHours.kt).
const NOTE_MAX_LENGTH = 500;
const COPY_TARGETS: readonly BusinessDay[] = ["tue", "wed", "thu", "fri"];

const WEEKDAYS = BUSINESS_DAYS.filter((d) => d !== "holiday");
const emptyWeek = (): BusinessDayHours[] =>
  WEEKDAYS.map((day) => ({ day, periods: [] }));

const inputProps = {
  h: "auto",
  px: "8px",
  py: "6px",
  bg: "nm.bg",
  border: "1px solid",
  borderColor: "nm.line",
  borderRadius: "nmMd",
  fontSize: "13px",
  color: "nm.ink",
  _focus: { borderColor: "nm.shu", bg: "white", boxShadow: "none" },
} as const;

const smallButtonProps = {
  variant: "plain",
  px: "8px",
  py: "4px",
  h: "auto",
  minH: "auto",
  minW: "auto",
  fontSize: "12px",
  color: "nm.inkMuted",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmMd",
  _hover: { borderColor: "nm.ink", color: "nm.ink" },
} as const;

/**
 * Edits 営業時間; undefined is 営業時間不明. Any change to the schedule or 補足
 * sets the 確認日 to today, which can then be changed by hand.
 */
export function BusinessHoursEditor({
  value,
  onChange,
}: {
  value: BusinessHours | undefined;
  onChange: (value: BusinessHours | undefined) => void;
}) {
  const kind: Kind = value?.kind ?? "unknown";
  const today = dayjs().format("YYYY-MM-DD");
  const change = (next: Omit<BusinessHours, "checkedOn">) =>
    onChange({ ...next, checkedOn: today });

  const setKind = (next: Kind) => {
    if (next === kind) {
      return;
    }
    if (next === "unknown") {
      onChange(undefined);
      return;
    }
    change({
      kind: next,
      days: next === "weekly" ? emptyWeek() : [],
      note: value?.note,
    });
  };

  const setDay = (day: BusinessDay, row: BusinessDayHours | undefined) => {
    if (!value) {
      return;
    }
    const others = value.days.filter((d) => d.day !== day);
    const days = row ? [...others, row] : others;
    days.sort(
      (a, b) => BUSINESS_DAYS.indexOf(a.day) - BUSINESS_DAYS.indexOf(b.day),
    );
    change({ ...value, days });
  };

  const copyMonday = () => {
    if (!value) {
      return;
    }
    const monday = value.days.find((d) => d.day === "mon");
    change({
      ...value,
      days: value.days.map((d) =>
        monday && COPY_TARGETS.includes(d.day) ? { ...monday, day: d.day } : d,
      ),
    });
  };

  const holidayRow = value?.days.find((d) => d.day === "holiday");

  return (
    <Box display="flex" flexDirection="column" gap="10px">
      <SegmentedPicker
        label="営業時間の種類"
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
      />
      {value?.kind === "weekly" && (
        <>
          <Box fontSize="11px" color="nm.inkMuted">
            時刻は 11:00 の形式で、深夜0時を過ぎる閉店は 26:00 のように書きます
          </Box>
          {WEEKDAYS.map((day) => (
            <DayRow
              key={day}
              row={
                value.days.find((d) => d.day === day) ?? { day, periods: [] }
              }
              onChange={(row) => setDay(day, row)}
            />
          ))}
          <Box display="flex" gap="8px" flexWrap="wrap">
            <Button {...smallButtonProps} onClick={copyMonday}>
              月曜の時間を火〜金にコピー
            </Button>
            <Button
              {...smallButtonProps}
              onClick={() =>
                setDay(
                  "holiday",
                  holidayRow ? undefined : { day: "holiday", periods: [] },
                )
              }
            >
              {holidayRow ? "祝日の時間を曜日どおりに戻す" : "祝日は別の時間"}
            </Button>
          </Box>
          {holidayRow && (
            <DayRow
              row={holidayRow}
              onChange={(row) => setDay("holiday", row)}
            />
          )}
        </>
      )}
      {value && (
        <>
          <Textarea
            aria-label="営業時間の補足"
            placeholder="補足（売り切れ次第終了、ほか不定休あり など）"
            value={value.note ?? ""}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(e) =>
              change({ ...value, note: e.target.value || undefined })
            }
            rows={2}
            {...inputProps}
          />
          <Box display="flex" alignItems="center" gap="8px" fontSize="12px">
            <Box as="span" color="nm.inkMuted" flexShrink={0}>
              確認日
            </Box>
            <Input
              aria-label="営業時間の確認日"
              type="date"
              value={value.checkedOn ?? ""}
              onChange={(e) =>
                onChange({ ...value, checkedOn: e.target.value || undefined })
              }
              fontFamily="mono"
              w="auto"
              {...inputProps}
            />
          </Box>
        </>
      )}
    </Box>
  );
}

function DayRow({
  row,
  onChange,
}: {
  row: BusinessDayHours;
  onChange: (row: BusinessDayHours) => void;
}) {
  const label = BUSINESS_DAY_LABEL[row.day];
  const setPeriods = (periods: BusinessPeriod[]) =>
    onChange({
      ...row,
      periods,
      // 定休日 has no weeks to skip.
      closedWeeks: periods.length > 0 ? row.closedWeeks : undefined,
    });
  const setPeriod = (index: number, period: BusinessPeriod) =>
    setPeriods(row.periods.map((p, i) => (i === index ? period : p)));
  const toggleWeek = (week: (typeof WEEKS)[number]) => {
    const n = Number(week);
    const weeks = row.closedWeeks ?? [];
    const next = weeks.includes(n)
      ? weeks.filter((w) => w !== n)
      : [...weeks, n].sort((a, b) => a - b);
    onChange({ ...row, closedWeeks: next.length > 0 ? next : undefined });
  };

  return (
    <Box
      display="grid"
      gridTemplateColumns="1.5rem 1fr"
      gap="8px"
      alignItems="start"
      fontSize="13px"
    >
      <Box pt="6px" fontWeight={600}>
        {label}
      </Box>
      <Box display="flex" flexDirection="column" gap="6px">
        {row.periods.length === 0 && (
          <Box pt="6px" color="nm.inkMuted">
            定休日
          </Box>
        )}
        {row.periods.map((period, i) => (
          <Box key={i} display="flex" alignItems="center" gap="6px">
            <Input
              aria-label={`${label} 時間帯${i + 1} 開始`}
              placeholder="11:00"
              value={period.opensAt}
              onChange={(e) =>
                setPeriod(i, { ...period, opensAt: e.target.value })
              }
              fontFamily="mono"
              w="5rem"
              {...inputProps}
            />
            〜
            <Input
              aria-label={`${label} 時間帯${i + 1} 終了`}
              placeholder="15:00"
              value={period.closesAt}
              onChange={(e) =>
                setPeriod(i, { ...period, closesAt: e.target.value })
              }
              fontFamily="mono"
              w="5rem"
              {...inputProps}
            />
            <Button
              {...smallButtonProps}
              aria-label={`${label} 時間帯${i + 1} を削除`}
              onClick={() => setPeriods(row.periods.filter((_, j) => j !== i))}
            >
              ✕
            </Button>
          </Box>
        ))}
        <Box display="flex" gap="8px" flexWrap="wrap" alignItems="center">
          {row.periods.length < PERIODS_MAX && (
            <Button
              {...smallButtonProps}
              aria-label={`${label} に時間帯を追加`}
              onClick={() =>
                setPeriods([...row.periods, { opensAt: "", closesAt: "" }])
              }
            >
              ＋ 時間帯
            </Button>
          )}
          {row.day !== "holiday" && row.periods.length > 0 && (
            <SegmentedToggles
              label={`${label}曜の休む週`}
              options={WEEKS}
              labels={WEEK_LABELS}
              value={
                (row.closedWeeks ?? []).map(String) as (typeof WEEKS)[number][]
              }
              onToggle={toggleWeek}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
