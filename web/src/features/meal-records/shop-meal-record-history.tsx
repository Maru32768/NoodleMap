import { useMealRecords } from "@/features/meal-records/api/use-meal-records.ts";
import {
  MealRecordList,
  MealRecordsLoadState,
} from "@/features/meal-records/meal-record-list.tsx";
import { Box } from "@chakra-ui/react";

/** A shop's 食べた記録 for everyone, loaded when shown; メモ（自分用） only when the API returns it (admin). */
export function ShopMealRecordHistory({ shopId }: { shopId: string }) {
  const { mealRecords, error, isValidating, retry } = useMealRecords(shopId);

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
        食べた記録 - Records
      </Box>
      <MealRecordsLoadState
        mealRecords={mealRecords}
        error={error}
        isValidating={isValidating}
        onRetry={retry}
      >
        {(mealRecords) => (
          <MealRecordList mealRecords={mealRecords} contextShopId={shopId} />
        )}
      </MealRecordsLoadState>
    </Box>
  );
}
