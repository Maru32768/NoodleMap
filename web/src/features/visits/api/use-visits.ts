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

export type VisitLog = components["schemas"]["VisitLog"];
export type VisitLogInput = components["schemas"]["VisitLogInput"];
export type VisitLogField = components["schemas"]["VisitLogField"];
export type SaveVisitErrorBody =
  | ApiErrorBodyFor<"/api/v1/auth/shops/{id}/visits", "post">
  | ApiErrorBodyFor<"/api/v1/auth/visits/{visitId}", "put">;
type DeleteVisitErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/visits/{visitId}",
  "delete"
>;

const VISITS_PATH = "/api/v1/shops/{id}/visits";

/**
 * Keyed by user so privateNote fetched as the admin never outlives a logout.
 * When /auth/me failed the visitor is unknown (the cookie may still be the
 * admin's), so `unknownOwner` keeps that cache entry private to one hook.
 */
export const visitsKey = (
  shopId: string,
  user: CurrentUser,
  unknownOwner = "unknown",
) =>
  [
    VISITS_PATH,
    shopId,
    user.type !== "guest"
      ? user.id
      : user.authFailed
        ? `unknown:${unknownOwner}`
        : "guest",
  ] as const;

// Every cached visits entry of the shop, whoever it was fetched for.
const isVisitsKeyOf = (shopId: string) => (key: unknown) =>
  Array.isArray(key) && key[0] === VISITS_PATH && key[1] === shopId;

/** A shop's 訪問ログ, newest first; privateNote only for the admin. Pass null to skip loading. */
export function useVisits(shopId: string | null) {
  const currentUser = useCurrentUser();
  const hookId = useId();
  // The app renders pages only after /auth/me has settled, so the user is known.
  const resp = useSWR(
    shopId ? visitsKey(shopId, currentUser, hookId) : null,
    ([, id]) =>
      withApiError("/api/v1/shops/{id}/visits", async () => {
        const res = await apiClient.GET("/api/v1/shops/{id}/visits", {
          params: { path: { id } },
        });
        if (res.error || !res.response.ok) {
          throwApiError("/api/v1/shops/{id}/visits", res.response, res.error);
        }
        return res.data.visits;
      }),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  const { mutate } = resp;
  // Called with no argument: mutate(data) would replace the cache.
  const retry = useCallback(() => mutate(), [mutate]);

  return {
    get visits() {
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
 * Refetches every cached visits entry of the shop (`visits`), the shop list
 * (`shops`: 食べた, 評価, visitCount, 代表写真) or both (`all`).
 */
export function useRevalidateShopVisits(shopId: string) {
  const { mutate } = useSWRConfig();
  const visits = useCallback(
    () => mutate(isVisitsKeyOf(shopId)),
    [mutate, shopId],
  );
  const shops = useCallback(() => mutate(SHOPS_KEY), [mutate]);
  const all = useCallback(
    () => Promise.all([visits(), shops()]),
    [visits, shops],
  );
  return useMemo(() => ({ visits, shops, all }), [visits, shops, all]);
}

/** Admin writes to a shop's 訪問ログ. Each success refetches the visits and the shop list (食べた, 評価, visitCount). */
export function useVisitMutations(shopId: string) {
  const revalidate = useRevalidateShopVisits(shopId).all;

  const addVisit = useCallback(
    (input: VisitLogInput) =>
      withApiResult<VisitLog, SaveVisitErrorBody>(
        "/api/v1/auth/shops/{id}/visits",
        async () => {
          const res = await apiClient.POST("/api/v1/auth/shops/{id}/visits", {
            params: { path: { id: shopId } },
            body: input,
          });
          if (res.error || !res.response.ok) {
            return apiError(
              "/api/v1/auth/shops/{id}/visits",
              res.response,
              res.error,
            );
          }
          await revalidate();
          return apiOk(res.data);
        },
      ),
    [shopId, revalidate],
  );

  const updateVisit = useCallback(
    (visitId: string, input: VisitLogInput) =>
      withApiResult<VisitLog, SaveVisitErrorBody>(
        "/api/v1/auth/visits/{visitId}",
        async () => {
          const res = await apiClient.PUT("/api/v1/auth/visits/{visitId}", {
            params: { path: { visitId } },
            body: input,
          });
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              // Deleted elsewhere: refresh so it leaves the list.
              await revalidate();
            }
            return apiError(
              "/api/v1/auth/visits/{visitId}",
              res.response,
              res.error,
            );
          }
          await revalidate();
          return apiOk(res.data);
        },
      ),
    [revalidate],
  );

  const deleteVisit = useCallback(
    (visitId: string) =>
      withApiResult<void, DeleteVisitErrorBody>(
        "/api/v1/auth/visits/{visitId}",
        async () => {
          const res = await apiClient.DELETE("/api/v1/auth/visits/{visitId}", {
            params: { path: { visitId } },
          });
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              // Deleted elsewhere: refresh so it leaves the list.
              await revalidate();
            }
            return apiError(
              "/api/v1/auth/visits/{visitId}",
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

  return { addVisit, updateVisit, deleteVisit };
}
