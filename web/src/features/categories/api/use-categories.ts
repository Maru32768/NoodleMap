import useSWR, { SWRConfiguration } from "swr";
import { ApiError, get } from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";

export interface Category {
  id: string;
  label: string;
  icon: string;
}

export function useCategories(config?: SWRConfiguration<Category[]>) {
  const resp = useSWR(
    ["/api/v1/categories"],
    () => {
      return get<{ categories: Category[] }>("/api/v1/categories")
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
