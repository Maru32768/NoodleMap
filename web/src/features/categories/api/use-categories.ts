import useSWR, { SWRConfiguration } from "swr";
import { ApiError, request } from "@/utils/request.ts";
import { toaster } from "@/components/ui/toaster.tsx";

export interface Category {
  id: string;
  label: string;
  icon: string;
}

export function useCategories(config?: SWRConfiguration<Category[]>) {
  const resp = useSWR(
    ["/api/v1/categories"],
    () => {
      return request<{ categories: Category[] }>("/api/v1/categories")
        .then((res) => {
          return res.body.categories;
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

  return {
    get categories() {
      return resp.data;
    },
  };
}
