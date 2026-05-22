import type { components } from "@/generated/api.ts";
import { ApiError, get, post } from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import { useCallback } from "react";
import useSWR from "swr";

const TOKEN_KEY = "token";

export let token: string | undefined =
  localStorage.getItem(TOKEN_KEY) ?? undefined;

export type User = components["schemas"]["User"];
type AuthResponse = components["schemas"]["AuthResponse"];

function clearToken() {
  token = undefined;
  localStorage.removeItem(TOKEN_KEY);
}

export function useAuth() {
  const resp = useSWR(
    ["useLogin-currentUser", token],
    () => {
      if (!token) {
        return undefined;
      }

      return get<User>("/api/v1/auth/me")
        .then((res) => {
          return res.body;
        })
        .catch((err: ApiError) => {
          if (err.status === 401) {
            clearToken();
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

  const login = useCallback(
    (email: string, password: string) => {
      return post<AuthResponse>("/api/v1/login", {
        body: JSON.stringify({ email, password }),
      })
        .then((res) => {
          token = res.body.token;
          localStorage.setItem(TOKEN_KEY, token);
          return mutate(res.body.user, false);
        })
        .catch((err: ApiError) => {
          toastApiError(err);
          throw err;
        });
    },
    [mutate],
  );

  const logout = useCallback(() => {
    return post("/api/v1/auth/logout")
      .then(() => {
        clearToken();
        return mutate(undefined, false);
      })
      .catch((err: ApiError) => {
        toastApiError(err);
        throw err;
      });
  }, [mutate]);

  const register = useCallback(
    (email: string, password: string) => {
      return post<AuthResponse>("/api/v1/register", {
        body: JSON.stringify({ email, password }),
      })
        .then((res) => {
          token = res.body.token;
          localStorage.setItem(TOKEN_KEY, token);
          return mutate(res.body.user, false);
        })
        .catch((err: ApiError) => {
          toastApiError(err);
          throw err;
        });
    },
    [mutate],
  );

  return {
    get currentUser() {
      return resp.data;
    },
    get isLoading() {
      return resp.isLoading;
    },
    login,
    logout,
    register,
  };
}
