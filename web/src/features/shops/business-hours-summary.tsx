import type { Shop } from "@/features/shops/api/use-shops.ts";
import {
  BUSINESS_DAY_LABEL,
  businessDayLabel,
  businessHoursHeadline,
  checkedOnLabel,
  isBusinessHoursStale,
  todaysBusinessDay,
} from "@/features/shops/business-hours.ts";
import { Box } from "@chakra-ui/react";
import type { Dayjs } from "dayjs";
import { Fragment, useId, useState } from "react";
import { LuChevronDown } from "react-icons/lu";

/** The 営業時間 row value: a headline that unfolds into the week, 補足 and 確認日 when there is any. */
export function BusinessHoursSummary({
  shop,
  now,
}: {
  shop: Shop;
  now?: Dayjs;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const hours = shop.businessHours;
  const headline = businessHoursHeadline(shop, now);
  const expandable =
    hours !== undefined &&
    (hours.kind === "weekly" ||
      hours.note !== undefined ||
      hours.checkedOn !== undefined);
  if (!hours || !expandable) {
    return <>{headline}</>;
  }

  const today = todaysBusinessDay(hours, now);
  const checked = checkedOnLabel(hours);
  const stale = isBusinessHoursStale(hours, now);

  return (
    <Box>
      <Box
        as="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((e) => !e)}
        display="inline-flex"
        alignItems="center"
        gap="0.25rem"
        color="nm.ink"
        textAlign="left"
        cursor="pointer"
      >
        {headline}
        <Box
          as="span"
          display="inline-flex"
          transform={expanded ? "rotate(180deg)" : undefined}
          transition="transform 0.15s"
          aria-hidden
        >
          <LuChevronDown size={14} />
        </Box>
      </Box>
      {expanded && (
        <Box id={detailsId} mt="0.5rem" fontSize="0.75rem" lineHeight="1.7">
          {hours.kind === "weekly" && (
            <Box
              as="dl"
              display="grid"
              gridTemplateColumns="1.5rem 1fr"
              columnGap="0.5rem"
            >
              {hours.days.map((row) => {
                const weight = row.day === today ? 700 : undefined;
                return (
                  <Fragment key={row.day}>
                    <Box as="dt" fontWeight={weight}>
                      {BUSINESS_DAY_LABEL[row.day]}
                    </Box>
                    <Box as="dd" fontWeight={weight}>
                      {businessDayLabel(row)}
                    </Box>
                  </Fragment>
                );
              })}
            </Box>
          )}
          {hours.note && (
            <Box mt="0.375rem" whiteSpace="pre-wrap">
              {hours.note}
            </Box>
          )}
          <Box mt="0.375rem" color="nm.inkMuted">
            {[checked, stale ? "情報が古い可能性があります" : null]
              .filter((s) => s !== null)
              .join("・")}
            {(checked || stale) && <br />}
            最新情報は公式でご確認ください
          </Box>
        </Box>
      )}
    </Box>
  );
}
