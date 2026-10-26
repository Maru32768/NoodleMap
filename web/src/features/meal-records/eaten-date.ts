/** A calendar date in Japan, YYYY-MM-DD, as the server's eatenOn. */
export type IsoDate = string & { readonly __brand: "IsoDate" };

const JAPAN_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });

/** The date in Japan at `instant`; en-CA formats a date as YYYY-MM-DD. */
export function japanDate(instant: Date): IsoDate {
  return JAPAN_DATE.format(instant) as IsoDate;
}
