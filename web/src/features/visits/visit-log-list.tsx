import { MiniHearts } from "@/features/shops/rating-hearts.tsx";
import { formatShopDate } from "@/features/shops/status.ts";
import type { VisitLog } from "@/features/visits/api/use-visits.ts";
import { Box } from "@chakra-ui/react";
import { ReactNode } from "react";

export function formatVisitDate(visitedOn: string | undefined): string {
  return formatShopDate(visitedOn) ?? "日付不明";
}

export function formatPrice(price: number): string {
  return `¥${price.toLocaleString("ja-JP")}`;
}

function NoteBlock({
  label,
  text,
  muted,
}: {
  label: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <Box
      mt="0.375rem"
      px="0.625rem"
      py="0.375rem"
      bg={muted ? "nm.bgSoft" : "nm.paper"}
      borderRadius="nmSm"
    >
      <Box fontSize="0.625rem" color="nm.inkMuted" mb="0.125rem">
        {label}
      </Box>
      <Box
        fontSize="0.75rem"
        color="nm.ink"
        whiteSpace="pre-wrap"
        overflowWrap="anywhere"
      >
        {text}
      </Box>
    </Box>
  );
}

function VisitLogEntry({
  visit,
  actions,
}: {
  visit: VisitLog;
  actions?: ReactNode;
}) {
  return (
    <Box as="li" bg="nm.bg" borderRadius="nmMd" px="0.875rem" py="0.625rem">
      <Box display="flex" alignItems="center" gap="0.5rem" flexWrap="wrap">
        <Box
          as="span"
          fontFamily="mono"
          fontSize="0.75rem"
          color="nm.ink"
          fontWeight={500}
        >
          {formatVisitDate(visit.visitedOn)}
        </Box>
        {visit.rate !== undefined ? (
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            gap="0.25rem"
          >
            <MiniHearts rate={visit.rate} />
            <Box as="span" fontFamily="mono" fontSize="0.6875rem">
              {visit.rate}
            </Box>
          </Box>
        ) : (
          <Box as="span" fontSize="0.6875rem" color="nm.inkFaint">
            未評価
          </Box>
        )}
        {actions && (
          <Box ml="auto" display="flex" gap="0.25rem">
            {actions}
          </Box>
        )}
      </Box>
      {(visit.menuName || visit.price !== undefined) && (
        <Box
          display="flex"
          alignItems="baseline"
          gap="0.375rem"
          mt="0.25rem"
          fontSize="0.8125rem"
          color="nm.ink"
        >
          {visit.menuName && (
            <Box as="span" overflowWrap="anywhere">
              {visit.menuName}
            </Box>
          )}
          {visit.isLimitedMenu && (
            <Box
              as="span"
              flexShrink={0}
              px="0.375rem"
              py="0.0625rem"
              bg="nm.shu"
              color="white"
              borderRadius="nmSm"
              fontSize="0.625rem"
              fontWeight={600}
            >
              限定
            </Box>
          )}
          {visit.price !== undefined && (
            <Box
              as="span"
              ml="auto"
              flexShrink={0}
              fontFamily="mono"
              fontSize="0.75rem"
            >
              {formatPrice(visit.price)}
            </Box>
          )}
        </Box>
      )}
      {visit.eventName && (
        <Box mt="0.25rem" fontSize="0.6875rem" color="nm.inkMuted">
          催事・イベント: {visit.eventName}
        </Box>
      )}
      {visit.publicNote && (
        <NoteBlock label="メモ（公開）" text={visit.publicNote} />
      )}
      {visit.privateNote && (
        <NoteBlock label="メモ（自分用）" text={visit.privateNote} muted />
      )}
    </Box>
  );
}

/** 訪問ログ in server order (newest first); `actions` adds per-entry controls. */
export function VisitLogList({
  visits,
  actions,
}: {
  visits: readonly VisitLog[];
  actions?: (visit: VisitLog) => ReactNode;
}) {
  return (
    <Box
      as="ul"
      aria-label="訪問ログ"
      listStyleType="none"
      display="flex"
      flexDirection="column"
      gap="0.5rem"
      p="0"
      m="0"
    >
      {visits.map((visit) => (
        <VisitLogEntry
          key={visit.id}
          visit={visit}
          actions={actions?.(visit)}
        />
      ))}
    </Box>
  );
}
