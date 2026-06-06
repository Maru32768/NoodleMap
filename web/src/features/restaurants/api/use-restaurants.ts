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

export type Restaurant = components["schemas"]["Restaurant"];
export type AddRestaurantCommand =
  components["schemas"]["AddRestaurantRequest"];
export type UpdateRestaurantCommand =
  components["schemas"]["UpdateRestaurantRequest"];
type AddRestaurantErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/restaurants",
  "post"
>;
type UpdateRestaurantErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/restaurants/{id}",
  "put"
>;

export function useRestaurants(config?: SWRConfiguration<Restaurant[]>) {
  const resp = useSWR(
    ["/api/v1/restaurants"],
    () => {
      return withApiError("/api/v1/restaurants", async () => {
        const res = await apiClient.GET("/api/v1/restaurants");
        if (res.error) {
          throwApiError("/api/v1/restaurants", res.response, res.error);
        }

        return res.data.restaurants;
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

  const addRestaurant = useCallback(
    (command: AddRestaurantCommand) => {
      return withApiResult<Restaurant, AddRestaurantErrorBody>(
        "/api/v1/auth/restaurants",
        async () => {
          const res = await apiClient.POST("/api/v1/auth/restaurants", {
            body: command,
          });
          if (res.error) {
            return apiError(
              "/api/v1/auth/restaurants",
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

  const updateRestaurant = useCallback(
    (id: string, command: UpdateRestaurantCommand) => {
      return withApiResult<void, UpdateRestaurantErrorBody>(
        "/api/v1/auth/restaurants/{id}",
        async () => {
          const res = await apiClient.PUT("/api/v1/auth/restaurants/{id}", {
            params: {
              path: { id },
            },
            body: command,
          });
          if (res.error) {
            return apiError(
              "/api/v1/auth/restaurants/{id}",
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
    get restaurants() {
      return resp.data;
    },
    addRestaurant,
    updateRestaurant,
  };
}
