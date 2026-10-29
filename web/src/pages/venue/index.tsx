import { useVenueMealRecords } from "@/features/meal-records/api/use-venues.ts";
import { MealRecordGrid } from "@/features/meal-records/meal-record-grid.tsx";
import { MealRecordsLoadState } from "@/features/meal-records/meal-record-list.tsx";
import { BackToMapLink } from "@/features/meal-records/record-navigation.tsx";
import { useDocumentTitle } from "@/utils/document-title.ts";
import { Box } from "@chakra-ui/react";
import { useState } from "react";
import { useParams } from "react-router";

export default function VenuePage() {
  const { venueId = "" } = useParams();
  const { data, error, isValidating, mutate } = useVenueMealRecords(venueId);
  const title = data?.venue.name ?? "催事・出店先";
  useDocumentTitle(title);
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  return (
    <Box ref={setScrollParent} h="100%" overflowY="auto" bg="nm.bg">
      <Box maxW="1280px" mx="auto" p={{ base: "20px", md: "40px" }}>
        <BackToMapLink />
        <Box as="h1" fontSize="24px" fontWeight={700} mt="24px" mb="8px">
          {title}
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
          {(mealRecords) => (
            <MealRecordGrid
              mealRecords={mealRecords}
              scrollParent={scrollParent}
              showVenue={false}
            />
          )}
        </MealRecordsLoadState>
      </Box>
    </Box>
  );
}
