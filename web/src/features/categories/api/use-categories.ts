import type { components } from "@/generated/api.ts";
import {
  ApiError,
  apiClient,
  throwApiError,
  withApiError,
} from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import useSWR, { SWRConfiguration } from "swr";

export type Category = components["schemas"]["Category"];

export function useCategories(config?: SWRConfiguration<Category[]>) {
  const resp = useSWR(
    ["/api/v1/categories"],
    () => {
      return withApiError("/api/v1/categories", async () => {
        const res = await apiClient.GET("/api/v1/categories");
        if (res.error) {
          throwApiError("/api/v1/categories", res.response, res.error);
        }

        return res.data.categories;
      }).catch((err: ApiError) => {
        toastApiError(err, {
          fallbackTitle: "カテゴリ一覧を読み込めませんでした",
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
