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
import { useCallback } from "react";
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

// Keyed by user so privateNote fetched as the admin never outlives a logout.
export const visitsKey = (shopId: string, user: CurrentUser) =>
  [
    "/api/v1/shops/{id}/visits",
    shopId,
    user.type === "guest" ? "guest" : user.id,
  ] as const;

/** A shop's 訪問ログ, newest first; privateNote only for the admin. Pass null to skip loading. */
export function useVisits(shopId: string | null) {
  const currentUser = useCurrentUser();
  const resp = useSWR(
    shopId ? visitsKey(shopId, currentUser) : null,
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
    retry: () => void resp.mutate(),
  };
}

/** Admin writes to a shop's 訪問ログ. Each success refetches the visits and the shop list (食べた, 評価, visitCount). */
export function useVisitMutations(shopId: string) {
  const { mutate } = useSWRConfig();
  const currentUser = useCurrentUser();

  const revalidate = useCallback(
    () =>
      Promise.all([mutate(visitsKey(shopId, currentUser)), mutate(SHOPS_KEY)]),
    [mutate, shopId, currentUser],
  );

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
