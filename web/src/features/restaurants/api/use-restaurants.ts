import type { components } from "@/generated/api.ts";
import { ApiError, get, post, put } from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import { useCallback } from "react";
import useSWR, { SWRConfiguration } from "swr";

export type Restaurant = components["schemas"]["Restaurant"];
export type AddRestaurantCommand =
  components["schemas"]["AddRestaurantRequest"];
export type UpdateRestaurantCommand =
  components["schemas"]["UpdateRestaurantRequest"];
type RestaurantsResponse = components["schemas"]["RestaurantsResponse"];

export function useRestaurants(config?: SWRConfiguration<Restaurant[]>) {
  const resp = useSWR(
    ["/api/v1/restaurants"],
    () => {
      return get<RestaurantsResponse>("/api/v1/restaurants")
        .then((res) => {
          return res.body.restaurants;
        })
        .catch((err: ApiError) => {
          toastApiError(err);
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
      return post<Restaurant>("/api/v1/auth/restaurants", {
        body: JSON.stringify(command),
      })
        .then((res) => {
          mutate((current) => {
            if (!current) {
              return current;
            }

            return [...current, res.body];
          }, false);

          return res.body;
        })
        .catch((err: ApiError) => {
          toastApiError(err);
          throw err;
        });
    },
    [mutate],
  );

  const updateRestaurant = useCallback(
    (id: string, command: UpdateRestaurantCommand) => {
      return put<Restaurant>(`/api/v1/auth/restaurants/${id}`, {
        body: JSON.stringify(command),
      })
        .then((res) => {
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

          return res.body;
        })
        .catch((err: ApiError) => {
          toastApiError(err);
          throw err;
        });
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
