import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import {
  VENUES_PATH,
  VENUE_MEAL_RECORDS_PATH,
  mealRecordsKey,
} from "@/features/meal-records/api/use-meal-records.ts";
import { apiClient, throwApiError, withApiError } from "@/utils/request.ts";
import { useId } from "react";
import useSWR from "swr";

export function useVenues() {
  return useSWR([VENUES_PATH], () =>
    withApiError(VENUES_PATH, async () => {
      const res = await apiClient.GET("/api/v1/venues");
      if (res.error || !res.response.ok) {
        throwApiError(VENUES_PATH, res.response, res.error);
      }
      return res.data.venues;
    }),
  );
}

export function useVenueMealRecords(venueId: string) {
  const user = useCurrentUser();
  const owner = useId();
  return useSWR(
    [VENUE_MEAL_RECORDS_PATH, ...mealRecordsKey(venueId, user, owner).slice(1)],
    () =>
      withApiError(VENUE_MEAL_RECORDS_PATH, async () => {
        const res = await apiClient.GET(
          "/api/v1/venues/{venueId}/meal-records",
          {
            params: { path: { venueId } },
          },
        );
        if (res.error || !res.response.ok) {
          throwApiError(VENUE_MEAL_RECORDS_PATH, res.response, res.error);
        }
        return res.data;
      }),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
}
