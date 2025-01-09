import useSWR from "swr";
import { ApiError, get, post } from "@/utils/request.ts";
import { useCallback } from "react";
import { toastApiError } from "@/utils/toast.ts";

const TOKEN_KEY = "token";

export let token: string | undefined =
  localStorage.getItem(TOKEN_KEY) ?? undefined;

export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
}

export function useAuth() {
  const resp = useSWR(
    ["useLogin-currentUser"],
    () => {
      if (!token) {
        return undefined;
      }

      return get<User>("/api/v1/auth/me").then((res) => {
        return res.body;
      });
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const mutate = resp.mutate;

  const login = useCallback(
    (email: string, password: string) => {
      return post<{ user: User; token: string }>("/api/v1/login", {
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
        token = undefined;
        localStorage.removeItem(TOKEN_KEY);
        return mutate(undefined, false);
      })
      .catch((err: ApiError) => {
        toastApiError(err);
        throw err;
      });
  }, [mutate]);

  const register = useCallback(
    (email: string, password: string) => {
      return post<{ user: User; token: string }>("/api/v1/register", {
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
