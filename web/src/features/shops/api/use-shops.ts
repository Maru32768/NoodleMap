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
import useSWR, { SWRConfiguration } from "swr";

export type Shop = components["schemas"]["Shop"];
export type AddShopCommand =
  components["schemas"]["AddShopRequest"];
export type UpdateShopCommand =
  components["schemas"]["UpdateShopRequest"];
type AddShopErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/shops",
  "post"
>;
type UpdateShopErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/shops/{id}",
  "put"
>;

export function useShops(config?: SWRConfiguration<Shop[]>) {
  const resp = useSWR(
    ["/api/v1/shops"],
    () => {
      return withApiError("/api/v1/shops", async () => {
        const res = await apiClient.GET("/api/v1/shops");
        if (res.error) {
          throwApiError("/api/v1/shops", res.response, res.error);
        }

        return res.data.shops;
      }).catch((err: ApiError) => {
        toastApiError(err, {
          fallbackTitle: "店舗一覧を読み込めませんでした",
        });
        throw err;
      });
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      ...config,
    },
  );
  const { mutate } = resp;

  const addShop = useCallback(
    (command: AddShopCommand) => {
      return withApiResult<Shop, AddShopErrorBody>(
        "/api/v1/auth/shops",
        async () => {
          const res = await apiClient.POST("/api/v1/auth/shops", {
            body: command,
          });
          if (res.error) {
            return apiError(
              "/api/v1/auth/shops",
              res.response,
              res.error,
            );
          }

          mutate((current) => {
            if (!current) {
              return current;
            }

            return [...current, res.data];
          }, false);

          return apiOk(res.data);
        },
      );
    },
    [mutate],
  );

  const updateShop = useCallback(
    (id: string, command: UpdateShopCommand) => {
      return withApiResult<void, UpdateShopErrorBody>(
        "/api/v1/auth/shops/{id}",
        async () => {
          const res = await apiClient.PUT("/api/v1/auth/shops/{id}", {
            params: {
              path: { id },
            },
            body: command,
          });
          if (res.error) {
            return apiError(
              "/api/v1/auth/shops/{id}",
              res.response,
              res.error,
            );
          }

          mutate((current) => {
            if (!current) {
              return current;
            }

            const i = current.findIndex((x) => x.id === id);
            const target = current[i];
            if (!target) {
              return current;
            }
            const copy = [...current];
            copy[i] = {
              ...current[i],
              ...command,
            };
            return copy;
          }, false);

          return apiOk(undefined);
        },
      );
    },
    [mutate],
  );

  return {
    get shops() {
      return resp.data;
    },
    addShop,
    updateShop,
  };
}
