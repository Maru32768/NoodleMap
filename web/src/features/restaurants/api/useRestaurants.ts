import { ApiError, request } from "@/utils/request.ts";
import useSWR from "swr";
import { toaster } from "@/components/ui/toaster.tsx";

export interface Restaurant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  googlePlaceId: string;
  rate: number;
  favorite: boolean;
  categories: {
    id: string;
    label: string;
  }[];
}

export const useRestaurants = () => {
  const resp = useSWR(["/api/restaurants"], () => {
    return request<{ restaurants: Restaurant[] }>("/api/restaurants")
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
  });

  return {
    get restaurants() {
      return resp.data;
    },
  };
};
