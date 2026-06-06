import type { components } from "@/generated/api.ts";
import { ApiError, get, post } from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import { useCallback } from "react";
import useSWR from "swr";

// Best-effort cleanup of the pre-Google-auth token that older clients persisted
// in localStorage. Safe to remove once all active sessions have rotated.
localStorage.removeItem("token");

export type User = components["schemas"]["User"];
type AuthResponse = components["schemas"]["AuthResponse"];

export function useAuth() {
  const resp = useSWR(
    "useAuth-currentUser",
    () => {
      return get<User>("/api/v1/auth/me")
        .then((res) => {
          return res.body;
        })
        .catch((err: ApiError) => {
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
      return post<AuthResponse>("/api/v1/auth/google", {
        body: JSON.stringify({ credential }),
      })
        .then((res) => {
          return mutate(res.body.user, false);
        })
        .catch((err: ApiError) => {
          toastApiError(err, {
            fallbackTitle: "Googleログインに失敗しました",
          });
          throw err;
        });
    },
    [mutate],
  );

  const logout = useCallback(() => {
    return post("/api/v1/auth/logout")
      .then(() => {
        return mutate(undefined, false);
      })
      .catch((err: ApiError) => {
        toastApiError(err, {
          fallbackTitle: "ログアウトできませんでした",
        });
        throw err;
      });
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
