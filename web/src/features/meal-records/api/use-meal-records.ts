import {
  CurrentUser,
  useCurrentUser,
} from "@/features/auth/use-current-user.ts";
import { SHOPS_KEY } from "@/features/shops/api/use-shops.ts";
import type { components } from "@/generated/api.ts";
import {
  ApiError,
  ApiErrorBodyFor,
  apiClient,
  apiError,
  apiOk,
  throwApiError,
  withApiError,
  withApiResult,
} from "@/utils/request.ts";
import { useCallback, useId, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";

export type MealRecord = components["schemas"]["MealRecord"];
export type MealRecordInput = components["schemas"]["MealRecordInput"];
export type MealRecordField = components["schemas"]["MealRecordField"];
export type MenuItem = components["schemas"]["MenuItem"];
export type MenuItemInput = components["schemas"]["MenuItemInput"];
export type SaveMealRecordErrorBody =
  | ApiErrorBodyFor<"/api/v1/auth/meal-records", "post">
  | ApiErrorBodyFor<"/api/v1/auth/meal-records/{mealRecordId}", "put">;
type DeleteMealRecordErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/meal-records/{mealRecordId}",
  "delete"
>;

const MEAL_RECORDS_PATH = "/api/v1/shops/{id}/meal-records";

/**
 * Keyed by user so privateNote fetched as the admin never outlives a logout.
 * When /auth/me failed the viewer is unknown (the cookie may still be the
 * admin's), so `unknownOwner` keeps that cache entry private to one hook.
 */
export const mealRecordsKey = (
  shopId: string,
  user: CurrentUser,
  unknownOwner = "unknown",
) =>
  [
    MEAL_RECORDS_PATH,
    shopId,
    user.type !== "guest"
      ? user.id
      : user.authFailed
        ? `unknown:${unknownOwner}`
        : "guest",
  ] as const;

// Every cached meal records entry of the shop, whoever it was fetched for.
export const VENUES_PATH = "/api/v1/venues";
export const VENUE_MEAL_RECORDS_PATH = "/api/v1/venues/{venueId}/meal-records";
const isRecordKey = (key: unknown) =>
  Array.isArray(key) &&
  [MEAL_RECORDS_PATH, VENUES_PATH, VENUE_MEAL_RECORDS_PATH].includes(key[0]);

/** A shop's 食べた記録, newest first; privateNote only for the admin. Throws `ApiError`. */
export function fetchMealRecords(shopId: string): Promise<MealRecord[]> {
  return withApiError("/api/v1/shops/{id}/meal-records", async () => {
    const res = await apiClient.GET("/api/v1/shops/{id}/meal-records", {
      params: { path: { id: shopId } },
    });
    if (res.error || !res.response.ok) {
      throwApiError("/api/v1/shops/{id}/meal-records", res.response, res.error);
    }
    return res.data.mealRecords;
  });
}

export function postMealRecord(input: MealRecordInput) {
  return withApiResult<MealRecord, SaveMealRecordErrorBody>(
    "/api/v1/auth/meal-records",
    async () => {
      const res = await apiClient.POST("/api/v1/auth/meal-records", {
        body: input,
      });
      if (res.error || !res.response.ok) {
        return apiError("/api/v1/auth/meal-records", res.response, res.error);
      }
      return apiOk(res.data);
    },
  );
}

/** Replaces every field of the mealRecord: an omitted field is cleared. */
export function putMealRecord(mealRecordId: string, input: MealRecordInput) {
  return withApiResult<MealRecord, SaveMealRecordErrorBody>(
    "/api/v1/auth/meal-records/{mealRecordId}",
    async () => {
      const res = await apiClient.PUT(
        "/api/v1/auth/meal-records/{mealRecordId}",
        {
          params: { path: { mealRecordId } },
          body: input,
        },
      );
      if (res.error || !res.response.ok) {
        return apiError(
          "/api/v1/auth/meal-records/{mealRecordId}",
          res.response,
          res.error,
        );
      }
      return apiOk(res.data);
    },
  );
}

/** The input that keeps every field of `mealRecord` through {@link putMealRecord}. */
export function mealRecordInputOf(mealRecord: MealRecord): MealRecordInput {
  // Every key required, so a field added to MealRecordInput fails to compile here.
  const input: { [K in keyof Required<MealRecordInput>]: MealRecordInput[K] } =
    {
      shopIds: mealRecord.shops.map((shop) => shop.id),
      eatenOn: mealRecord.eatenOn,
      menuItems: mealRecord.menuItems.map(({ name, isLimited, price }) => ({
        name,
        isLimited,
        price,
      })),
      rate: mealRecord.rate,
      // Keeping a record leaves the shops' own お気に入り度 alone.
      rateShopIds: undefined,
      venueName: mealRecord.venue?.name,
      publicNote: mealRecord.publicNote,
      privateNote: mealRecord.privateNote,
    };
  return input;
}

/** A shop's 食べた記録, newest first; privateNote only for the admin. Pass null to skip loading. */
export function useMealRecords(shopId: string | null) {
  const currentUser = useCurrentUser();
  const hookId = useId();
  // The app renders pages only after /auth/me has settled, so the user is known.
  const resp = useSWR(
    shopId ? mealRecordsKey(shopId, currentUser, hookId) : null,
    ([, id]) => fetchMealRecords(id),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  const { mutate } = resp;
  // Called with no argument: mutate(data) would replace the cache.
  const retry = useCallback(() => mutate(), [mutate]);

  return {
    get mealRecords() {
      return resp.data;
    },
    get error() {
      return resp.error as ApiError | undefined;
    },
    get isValidating() {
      return resp.isValidating;
    },
    retry,
  };
}

/**
 * Refetches every shop and venue record view (`mealRecords`), the shop list
 * (`shops`: 食べた, お気に入り度, mealRecordCount, 代表写真) or both (`all`).
 */
export function useRevalidateRecords() {
  const { mutate } = useSWRConfig();
  const mealRecords = useCallback(() => mutate(isRecordKey), [mutate]);
  const shops = useCallback(() => mutate(SHOPS_KEY), [mutate]);
  const all = useCallback(
    () => Promise.all([mealRecords(), shops()]),
    [mealRecords, shops],
  );
  return useMemo(
    () => ({ mealRecords, shops, all }),
    [mealRecords, shops, all],
  );
}

/** Refetches every cached mealRecords entry of every shop, e.g. once after a bulk import. */
export function useRevalidateAllMealRecords() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => Promise.all([mutate(isRecordKey), mutate(SHOPS_KEY)]),
    [mutate],
  );
}

/** Admin writes to a shop's 食べた記録. Each success refetches the mealRecords and the shop list (食べた, お気に入り度, mealRecordCount). */
export function useMealRecordMutations() {
  const revalidate = useRevalidateRecords().all;

  const addMealRecord = useCallback(
    async (input: MealRecordInput) => {
      const result = await postMealRecord(input);
      if (result.ok) {
        await revalidate();
      }
      return result;
    },
    [revalidate],
  );

  const updateMealRecord = useCallback(
    async (mealRecordId: string, input: MealRecordInput) => {
      const result = await putMealRecord(mealRecordId, input);
      // not_found: deleted elsewhere, so refresh to drop it from the list.
      if (result.ok || result.error.type === "not_found") {
        await revalidate();
      }
      return result;
    },
    [revalidate],
  );

  const deleteMealRecord = useCallback(
    (mealRecordId: string) =>
      withApiResult<void, DeleteMealRecordErrorBody>(
        "/api/v1/auth/meal-records/{mealRecordId}",
        async () => {
          const res = await apiClient.DELETE(
            "/api/v1/auth/meal-records/{mealRecordId}",
            {
              params: { path: { mealRecordId } },
            },
          );
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              // Deleted elsewhere: refresh so it leaves the list.
              await revalidate();
            }
            return apiError(
              "/api/v1/auth/meal-records/{mealRecordId}",
              res.response,
              res.error,
            );
          }
          await revalidate();
          return apiOk(undefined);
        },
      ),
    [revalidate],
  );

  return { addMealRecord, updateMealRecord, deleteMealRecord };
}
