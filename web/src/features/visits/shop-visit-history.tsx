import { useVisits } from "@/features/visits/api/use-visits.ts";
import {
  VisitLogList,
  VisitsLoadState,
} from "@/features/visits/visit-log-list.tsx";
import { Box } from "@chakra-ui/react";

/** A shop's 訪問ログ for everyone, loaded when shown; メモ（自分用） only when the API returns it (admin). */
export function ShopVisitHistory({ shopId }: { shopId: string }) {
  const { visits, error, isValidating, retry } = useVisits(shopId);

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
      <VisitsLoadState
        visits={visits}
        error={error}
        isValidating={isValidating}
        onRetry={retry}
      >
        {(visits) => <VisitLogList visits={visits} />}
      </VisitsLoadState>
    </Box>
  );
}
