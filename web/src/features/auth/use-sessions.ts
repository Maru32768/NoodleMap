import { useCurrentUser } from "@/features/auth/use-current-user.ts";
import type { components } from "@/generated/api.ts";
import { ACCOUNT_PATH, LOGIN_PATH } from "@/utils/path.ts";
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
import { toastApiError } from "@/utils/toast.ts";
import { useCallback } from "react";
import useSWR from "swr";

export type AuthSession = components["schemas"]["AuthSession"];
type RevokeSessionErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/sessions/{id}",
  "delete"
>;
type RevokeOtherSessionsErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/sessions/revoke-others",
  "post"
>;

// 401 here means this session was revoked elsewhere. A full reload re-resolves
// auth, so the user lands on login instead of a page stuck on a dead session.
function redirectToLogin() {
  window.location.replace(
    `${LOGIN_PATH}?redirectTo=${encodeURIComponent(ACCOUNT_PATH)}`,
  );
}

export function useSessions() {
  const currentUser = useCurrentUser();
  // Keyed by user so a cached list never outlives a logout/login as someone else.
  const key =
    currentUser.type === "guest"
      ? null
      : (["/api/v1/auth/sessions", currentUser.id] as const);
  const resp = useSWR(
    key,
    () => {
      return withApiError("/api/v1/auth/sessions", async () => {
        const res = await apiClient.GET("/api/v1/auth/sessions");
        if (res.error || !res.response.ok) {
          throwApiError("/api/v1/auth/sessions", res.response, res.error);
        }

        return res.data.sessions;
      });
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: (err) => {
        return !(err instanceof ApiError && err.status === 401);
      },
      // Without data the page shows the failure inline; toast only when a
      // revalidation fails behind a list that stays on screen.
      onError: (err: ApiError) => {
        if (err.status === 401) {
          redirectToLogin();
          return;
        }
        if (resp.data) {
          toastApiError(err, {
            id: "sessions-revalidate-error",
            fallbackTitle: "ログイン中の端末を読み込めませんでした",
          });
        }
      },
    },
  );
  const { mutate } = resp;

  const revokeSession = useCallback(
    (id: string) => {
      return withApiResult<void, RevokeSessionErrorBody>(
        "/api/v1/auth/sessions/{id}",
        async () => {
          const res = await apiClient.DELETE("/api/v1/auth/sessions/{id}", {
            params: { path: { id } },
          });
          // A typed not_found means already revoked or expired, which is the goal
          // anyway; a bodiless 404 (e.g. a server without this route) is an error.
          // Check `ok`, not `res.error`: openapi-fetch leaves `error` undefined
          // for an empty error body.
          if (!res.response.ok && res.error?.type !== "not_found") {
            if (res.response.status === 401) {
              redirectToLogin();
            }
            return apiError(
              "/api/v1/auth/sessions/{id}",
              res.response,
              // May be undefined or text; ApiError only reads a typed body.
              res.error as RevokeSessionErrorBody,
            );
          }

          await mutate((current) => current?.filter((s) => s.id !== id), false);
          return apiOk(undefined);
        },
      );
    },
    [mutate],
  );

  const revokeOtherSessions = useCallback(() => {
    return withApiResult<void, RevokeOtherSessionsErrorBody>(
      "/api/v1/auth/sessions/revoke-others",
      async () => {
        const res = await apiClient.POST("/api/v1/auth/sessions/revoke-others");
        if (!res.response.ok) {
          if (res.response.status === 401) {
            redirectToLogin();
          }
          return apiError(
            "/api/v1/auth/sessions/revoke-others",
            res.response,
            // May be undefined or text; ApiError only reads a typed body.
            res.error as RevokeOtherSessionsErrorBody,
          );
        }

        await mutate((current) => current?.filter((s) => s.current), false);
        return apiOk(undefined);
      },
    );
  }, [mutate]);

  return {
    get sessions() {
      return resp.data;
    },
    get error() {
      return resp.error as ApiError | undefined;
    },
    get isValidating() {
      return resp.isValidating;
    },
    mutate,
    revokeSession,
    revokeOtherSessions,
  };
}
