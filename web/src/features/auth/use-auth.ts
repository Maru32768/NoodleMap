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
import useSWR from "swr";

// Best-effort cleanup of the pre-Google-auth token that older clients persisted
// in localStorage. Safe to remove once all active sessions have rotated.
localStorage.removeItem("token");

export type User = components["schemas"]["User"];
type GoogleAuthErrorBody = ApiErrorBodyFor<"/api/v1/auth/google", "post">;
type LogoutErrorBody = ApiErrorBodyFor<"/api/v1/auth/logout", "post">;

export function useAuth() {
  const resp = useSWR(
    "useAuth-currentUser",
    () => {
      return withApiError("/api/v1/auth/me", async () => {
        const res = await apiClient.GET("/api/v1/auth/me");
        if (res.error) {
          throwApiError("/api/v1/auth/me", res.response, res.error);
        }

        return res.data;
      }).catch((err: ApiError) => {
        if (err.status === 401) {
          return undefined;
        }
        throw err;
      });
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: (err) => {
        return !(err instanceof ApiError && err.status === 401);
      },
    },
  );
  const mutate = resp.mutate;

  const loginWithGoogle = useCallback(
    (credential: string) => {
      return withApiResult<User, GoogleAuthErrorBody>(
        "/api/v1/auth/google",
        async () => {
          const res = await apiClient.POST("/api/v1/auth/google", {
            body: { credential },
          });
          if (res.error) {
            return apiError("/api/v1/auth/google", res.response, res.error);
          }

          await mutate(res.data.user, false);
          return apiOk(res.data.user);
        },
      );
    },
    [mutate],
  );

  const logout = useCallback(() => {
    return withApiResult<void, LogoutErrorBody>(
      "/api/v1/auth/logout",
      async () => {
        const res = await apiClient.POST("/api/v1/auth/logout");
        if (res.error) {
          return apiError("/api/v1/auth/logout", res.response, res.error);
        }

        await mutate(undefined, false);
        return apiOk(undefined);
      },
    );
  }, [mutate]);

  return {
    get currentUser() {
      return resp.data;
    },
    get isLoading() {
      return resp.isLoading;
    },
    loginWithGoogle,
    logout,
  };
}
