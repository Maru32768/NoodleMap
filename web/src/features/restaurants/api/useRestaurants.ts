import { ApiError, request } from "@/utils/request.ts";
import useSWR, { SWRConfiguration } from "swr";
import { toaster } from "@/components/ui/toaster.tsx";

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  googlePlaceId: string;
  visited: boolean;
  rate: number | undefined;
  favorite: boolean | undefined;
  categories: string[];
}

export function useRestaurants(config?: SWRConfiguration<Restaurant[]>) {
  const resp = useSWR(
    ["/api/v1/restaurants"],
    () => {
      return request<{ restaurants: Restaurant[] }>("/api/v1/restaurants")
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
    config,
  );

  return {
    get restaurants() {
      return resp.data;
    },
  };
}
