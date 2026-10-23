import { useVisits } from "@/features/visits/api/use-visits.ts";
import { VisitLogList } from "@/features/visits/visit-log-list.tsx";
import { Box } from "@chakra-ui/react";

/** A shop's 訪問ログ for everyone, loaded when shown; メモ（自分用） only when the API returns it (admin). */
export function ShopVisitHistory({ shopId }: { shopId: string }) {
  const { visits, error } = useVisits(shopId);

  return (
    <Box>
      <Box
        fontFamily="mono"
        fontSize="0.625rem"
        letterSpacing="0.18em"
        color="nm.inkMuted"
        textTransform="uppercase"
        mb="0.5rem"
      >
        訪問ログ - Visits
      </Box>
      {error ? (
        <Box fontSize="0.75rem" color="nm.shuDeep">
          訪問ログを読み込めませんでした
        </Box>
      ) : !visits ? (
        <Box fontSize="0.75rem" color="nm.inkMuted">
          読み込み中…
        </Box>
      ) : (
        <VisitLogList visits={visits} />
      )}
    </Box>
  );
}
