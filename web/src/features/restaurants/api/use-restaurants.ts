import { ApiError, get, post, put } from "@/utils/request.ts";
import useSWR, { SWRConfiguration } from "swr";
import { toaster } from "@/components/ui/toaster.tsx";
import { useCallback } from "react";
import { apiErrorToast } from "@/utils/toast.ts";

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  closed: boolean;
  postalCode: string;
  address: string;
  googlePlaceId: string;
  visited: boolean;
  rate: number | undefined;
  favorite: boolean | undefined;
  categories: string[];
}

export interface AddRestaurantCommand {
  name: string;
  lat: number;
  lng: number;
  postalCode: string;
  address: string;
  closed: boolean;
  googlePlaceId: string;
  categories: string[];
}

export interface UpdateRestaurantCommand {
  name: string;
  lat: number;
  lng: number;
  postalCode: string;
  address: string;
  closed: boolean;
  googlePlaceId: string;
  visited: boolean;
  favorite: boolean;
  rate: number;
}

export function useRestaurants(config?: SWRConfiguration<Restaurant[]>) {
  const resp = useSWR(
    ["/api/v1/restaurants"],
    () => {
      return get<{ restaurants: Restaurant[] }>("/api/v1/restaurants")
        .then((res) => {
          return res.body.restaurants;
        })
        .catch((err: ApiError) => {
          toaster.create({
            title: err.statusText,
            description: JSON.stringify(err.body),
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
          apiErrorToast(err);
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
          apiErrorToast(err);
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
