import {
  businessDayLabel,
  BusinessHours,
  businessHoursHeadline,
  checkedOnLabel,
  isBusinessHoursStale,
  isOpenAt,
  todaysBusinessDay,
} from "@/features/shops/business-hours.ts";
import { makeShop } from "@/test/fixtures.ts";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

// November 2026: the 1st is a Sunday, the 3rd (Tue) and the 23rd (Mon) are 祝日.
const lunch = [{ opensAt: "11:00", closesAt: "15:00" }];
const weekly: BusinessHours = {
  kind: "weekly",
  days: [
    { day: "mon", periods: lunch },
    {
      day: "tue",
      periods: [...lunch, { opensAt: "18:00", closesAt: "26:00" }],
    },
    { day: "wed", periods: lunch, closedWeeks: [2, 4] },
    { day: "thu", periods: lunch },
    { day: "fri", periods: lunch },
    { day: "sat", periods: [] },
    { day: "sun", periods: [] },
    { day: "holiday", periods: [{ opensAt: "12:00", closesAt: "14:00" }] },
  ],
  checkedOn: "2026-11-08",
};

const at = (iso: string) => dayjs(iso);

describe("isOpenAt", () => {
  const shop = makeShop({ businessHours: weekly });

  it("is open inside a period and closed outside it", () => {
    expect(isOpenAt(shop, at("2026-11-02T11:00"))).toBe(true);
    expect(isOpenAt(shop, at("2026-11-02T14:59"))).toBe(true);
    expect(isOpenAt(shop, at("2026-11-02T15:00"))).toBe(false);
    expect(isOpenAt(shop, at("2026-11-02T10:59"))).toBe(false);
  });

  it("is closed on a 定休日", () => {
    expect(isOpenAt(shop, at("2026-11-08T12:00"))).toBe(false);
  });

  it("follows the 祝日 row on a 祝日", () => {
    expect(isOpenAt(shop, at("2026-11-03T11:30"))).toBe(false);
    expect(isOpenAt(shop, at("2026-11-03T12:30"))).toBe(true);
  });

  it("follows the weekday on a 祝日 when there is no 祝日 row", () => {
    const noHolidayRow = makeShop({
      businessHours: {
        ...weekly,
        days: weekly.days.filter((d) => d.day !== "holiday"),
      },
    });
    expect(isOpenAt(noHolidayRow, at("2026-11-03T11:30"))).toBe(true);
  });

  it("counts hours past midnight on the day the period opened", () => {
    expect(isOpenAt(shop, at("2026-11-11T01:30"))).toBe(true);
    expect(isOpenAt(shop, at("2026-11-11T02:00"))).toBe(false);
  });

  it("skips the weeks of the month the weekday is closed", () => {
    expect(isOpenAt(shop, at("2026-11-11T12:00"))).toBe(false);
    expect(isOpenAt(shop, at("2026-11-18T12:00"))).toBe(true);
    expect(isOpenAt(shop, at("2026-11-25T12:00"))).toBe(false);
  });

  it("is not open on 臨時休業, after closing, or before opening", () => {
    const monday = at("2026-11-02T12:00");
    const onClosure = makeShop({
      businessHours: weekly,
      temporaryClosure: { startsOn: "2026-11-01", reopensOn: "2026-11-05" },
    });
    expect(isOpenAt(onClosure, monday)).toBe(false);
    expect(isOpenAt(onClosure, at("2026-11-05T12:00"))).toBe(true);
    expect(
      isOpenAt(
        makeShop({ businessHours: weekly, closedAt: "2026-11-02" }),
        monday,
      ),
    ).toBe(false);
    expect(
      isOpenAt(
        makeShop({ businessHours: weekly, openedAt: "2026-11-03" }),
        monday,
      ),
    ).toBe(false);
  });

  it("is never open for 不定休 or unknown hours", () => {
    const monday = at("2026-11-02T12:00");
    expect(
      isOpenAt(
        makeShop({ businessHours: { kind: "irregular", days: [] } }),
        monday,
      ),
    ).toBe(false);
    expect(isOpenAt(makeShop(), monday)).toBe(false);
  });
});

describe("businessHoursHeadline", () => {
  const shop = makeShop({ businessHours: weekly });

  it("says until when the shop is open", () => {
    expect(businessHoursHeadline(shop, at("2026-11-02T12:00"))).toBe(
      "営業中・15:00まで",
    );
    expect(businessHoursHeadline(shop, at("2026-11-11T01:00"))).toBe(
      "営業中・2:00まで",
    );
  });

  it("gives the later closing when a period past midnight overlaps the next day's", () => {
    const allSaturday = makeShop({
      businessHours: {
        ...weekly,
        days: weekly.days.map((d) =>
          d.day === "sat"
            ? { day: "sat", periods: [{ opensAt: "00:00", closesAt: "24:00" }] }
            : d.day === "fri"
              ? {
                  day: "fri",
                  periods: [{ opensAt: "18:00", closesAt: "26:00" }],
                }
              : d,
        ),
      },
    });
    expect(businessHoursHeadline(allSaturday, at("2026-11-07T01:00"))).toBe(
      "営業中・0:00まで",
    );
  });

  it("says when the shop opens next", () => {
    expect(businessHoursHeadline(shop, at("2026-11-02T09:00"))).toBe(
      "営業時間外・次は11:00",
    );
    expect(businessHoursHeadline(shop, at("2026-11-05T16:00"))).toBe(
      "営業時間外・次は明日 11:00",
    );
    expect(businessHoursHeadline(shop, at("2026-11-02T16:00"))).toBe(
      "営業時間外・次は明日 12:00",
    );
    expect(businessHoursHeadline(shop, at("2026-11-06T16:00"))).toBe(
      "営業時間外・次は月 11:00",
    );
  });

  it("gives the date when the next opening is a week or more away", () => {
    const closedAWeek = makeShop({
      businessHours: weekly,
      temporaryClosure: { startsOn: "2026-11-10", reopensOn: "2026-11-19" },
    });
    expect(businessHoursHeadline(closedAWeek, at("2026-11-09T16:00"))).toBe(
      "営業時間外・次は11/19(木) 11:00",
    );
  });

  it("reads back-to-back periods as one stretch", () => {
    const allDay = [{ opensAt: "00:00", closesAt: "24:00" }];
    const around = (days: BusinessHours["days"]) =>
      makeShop({ businessHours: { kind: "weekly", days } });
    const everyDay = around(
      weekly.days.map((d) => ({ day: d.day, periods: allDay })),
    );
    expect(businessHoursHeadline(everyDay, at("2026-11-02T12:00"))).toBe(
      "営業中・24時間営業",
    );
    const split = around(
      weekly.days.map((d) => ({
        day: d.day,
        periods: [
          { opensAt: "11:00", closesAt: "15:00" },
          { opensAt: "15:00", closesAt: "22:00" },
        ],
      })),
    );
    expect(businessHoursHeadline(split, at("2026-11-02T12:00"))).toBe(
      "営業中・22:00まで",
    );
    const weekend = around(
      weekly.days.map((d) => ({
        day: d.day,
        periods: d.day === "sat" || d.day === "sun" ? allDay : [],
      })),
    );
    // Open since Friday 0:00, closing Saturday 22:00: under a day away, but not today.
    const untilSaturdayNight = around(
      weekly.days.map((d) => ({
        day: d.day,
        periods:
          d.day === "sat"
            ? [{ opensAt: "00:00", closesAt: "22:00" }]
            : d.day === "fri"
              ? allDay
              : [],
      })),
    );
    expect(
      businessHoursHeadline(untilSaturdayNight, at("2026-11-06T23:00")),
    ).toBe("営業中・明日 22:00まで");
    // Every day but the 第2 Sunday: the stretch ends on 12/13, past a week.
    const allButSecondSunday = around(
      weekly.days.map((d) => ({
        day: d.day,
        periods: allDay,
        ...(d.day === "sun" && { closedWeeks: [2] }),
      })),
    );
    expect(
      businessHoursHeadline(allButSecondSunday, at("2026-11-09T12:00")),
    ).toBe("営業中・12/13(日) 0:00まで");
    expect(businessHoursHeadline(weekend, at("2026-11-07T12:00"))).toBe(
      "営業中・月 0:00まで",
    );
  });

  it("names 不定休, unknown hours and 臨時休業", () => {
    const now = at("2026-11-02T12:00");
    expect(
      businessHoursHeadline(
        makeShop({ businessHours: { kind: "irregular", days: [] } }),
        now,
      ),
    ).toBe("不定休");
    expect(businessHoursHeadline(makeShop(), now)).toBe("営業時間不明");
    const closed = makeShop({
      businessHours: weekly,
      temporaryClosure: { startsOn: "2026-11-01", reopensOn: "2026-11-05" },
    });
    expect(businessHoursHeadline(closed, now)).toBe("臨時休業");
  });
});

describe("row labels", () => {
  it("formats periods, past-midnight closings, closed weeks and 定休日", () => {
    const [mon, tue, wed, , , sat] = weekly.days;
    expect(businessDayLabel(mon)).toBe("11:00〜15:00");
    expect(businessDayLabel(tue)).toBe("11:00〜15:00、18:00〜翌2:00");
    expect(businessDayLabel(wed)).toBe("11:00〜15:00（第2・第4は休み）");
    expect(businessDayLabel(sat)).toBe("定休日");
  });

  it("highlights the 祝日 row on a 祝日 and the weekday otherwise", () => {
    expect(todaysBusinessDay(weekly, at("2026-11-03T09:00"))).toBe("holiday");
    expect(todaysBusinessDay(weekly, at("2026-11-04T09:00"))).toBe("wed");
  });
});

describe("確認日", () => {
  it("labels the month and turns stale after a year", () => {
    expect(checkedOnLabel(weekly)).toBe("2026年11月確認");
    expect(isBusinessHoursStale(weekly, at("2027-11-08T12:00"))).toBe(false);
    expect(isBusinessHoursStale(weekly, at("2027-11-09T12:00"))).toBe(true);
    expect(isBusinessHoursStale({ ...weekly, checkedOn: undefined })).toBe(
      true,
    );
  });
});
