import type { components } from "@/generated/api.ts";
import { ApiError, get } from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import useSWR, { SWRConfiguration } from "swr";

export type Category = components["schemas"]["Category"];
type CategoriesResponse = components["schemas"]["CategoriesResponse"];

export function useCategories(config?: SWRConfiguration<Category[]>) {
  const resp = useSWR(
    ["/api/v1/categories"],
    () => {
      return get<CategoriesResponse>("/api/v1/categories")
        .then((res) => {
          return res.body.categories;
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

  return {
    get categories() {
      return resp.data;
    },
  };
}
