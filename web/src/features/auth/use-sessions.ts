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

export function useSessions() {
  const resp = useSWR(["/api/v1/auth/sessions"], () => {
    return withApiError("/api/v1/auth/sessions", async () => {
      const res = await apiClient.GET("/api/v1/auth/sessions");
      if (res.error) {
        throwApiError("/api/v1/auth/sessions", res.response, res.error);
      }

      return res.data.sessions;
    }).catch((err: ApiError) => {
      toastApiError(err, {
        fallbackTitle: "ログイン中の端末を読み込めませんでした",
      });
      throw err;
    });
  });
  const { mutate } = resp;

  const revokeSession = useCallback(
    (id: string) => {
      return withApiResult<void, RevokeSessionErrorBody>(
        "/api/v1/auth/sessions/{id}",
        async () => {
          const res = await apiClient.DELETE("/api/v1/auth/sessions/{id}", {
            params: { path: { id } },
          });
          if (res.error) {
            return apiError(
              "/api/v1/auth/sessions/{id}",
              res.response,
              res.error,
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
        if (res.error) {
          return apiError(
            "/api/v1/auth/sessions/revoke-others",
            res.response,
            res.error,
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
    revokeSession,
    revokeOtherSessions,
  };
}
