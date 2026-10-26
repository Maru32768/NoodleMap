import { useVenueMealRecords } from "@/features/meal-records/api/use-venues.ts";
import {
  MealRecordList,
  MealRecordsLoadState,
} from "@/features/meal-records/meal-record-list.tsx";
import { VenueMapLink } from "@/features/meal-records/record-navigation.tsx";
import { Box } from "@chakra-ui/react";
import { useParams } from "react-router";

export default function VenuePage() {
  const { venueId = "" } = useParams();
  const { data, error, isValidating, mutate } = useVenueMealRecords(venueId);
  return (
    <Box maxW="800px" mx="auto" p={{ base: "20px", md: "40px" }}>
      <VenueMapLink />
      <Box as="h1" fontSize="24px" fontWeight={700} mt="24px" mb="8px">
        {data?.venue.name ?? "催事・出店先"}
      </Box>
      <Box as="p" mb="24px" fontSize="14px">
        ここで食べた記録
      </Box>
      <MealRecordsLoadState
        mealRecords={data?.mealRecords}
        error={error}
        isValidating={isValidating}
        onRetry={() => mutate()}
      >
        {(mealRecords) => <MealRecordList mealRecords={mealRecords} />}
      </MealRecordsLoadState>
    </Box>
  );
}
