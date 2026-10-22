import type {
  ShopEatenStatus,
  ShopLifecycleStatus,
  ShopRecencyStatus,
} from "@/features/shops/status.ts";
import {
  parseShopDate,
  shopEatenStatus,
  shopLifecycleStatus,
  shopRecencyStatus,
} from "@/features/shops/status.ts";
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
import type { Dayjs } from "dayjs";
import { useCallback } from "react";
import useSWR, { SWRConfiguration } from "swr";

type ApiShop = components["schemas"]["Shop"];

export type Shop = ApiShop & {
  // Opened/closed dates parsed once at fetch time into local-midnight dayjs
  // values (null when absent or unparseable), so status derivation never
  // reparses the same strings on every render. See decorateShop below.
  readonly openedAtDate: Dayjs | null;
  readonly closedAtDate: Dayjs | null;
  readonly lifecycleStatus: ShopLifecycleStatus;
  readonly recencyStatus: ShopRecencyStatus;
  readonly eatenStatus: ShopEatenStatus;
};

// Mirrors the server's favorite rule (ShopHandler.isFavorite); only for optimistic cache updates.
export function isFavorite(eaten: boolean, rate: number): boolean {
  return eaten && rate >= 80;
}

// Attaches the cached parsed dates used by the status helpers. Run wherever a
// raw API shop enters the SWR cache (fetch, optimistic add, optimistic update).
export function decorateShop(shop: ApiShop): Shop {
  const datedShop = {
    ...shop,
    openedAtDate: parseShopDate(shop.openedAt),
    closedAtDate: parseShopDate(shop.closedAt),
  };

  return {
    ...datedShop,
    lifecycleStatus: shopLifecycleStatus(datedShop),
    recencyStatus: shopRecencyStatus(datedShop),
    eatenStatus: shopEatenStatus(datedShop),
  };
}
export type Tag = components["schemas"]["Tag"];
export type TagInput = components["schemas"]["TagInput"];
export type AddShopCommand = components["schemas"]["AddShopRequest"];
export type UpdateShopCommand = components["schemas"]["UpdateShopRequest"];
type AddShopErrorBody = ApiErrorBodyFor<"/api/v1/auth/shops", "post">;
type UpdateShopErrorBody = ApiErrorBodyFor<"/api/v1/auth/shops/{id}", "put">;
export type SaveTagsErrorBody = ApiErrorBodyFor<"/api/v1/auth/tags", "put">;

export function isDuplicatePlaceIdError(
  body: AddShopErrorBody | UpdateShopErrorBody | undefined,
): boolean {
  if (body?.type === "invalid_request") {
    return (
      body.fieldErrors?.some(
        (fieldError) =>
          fieldError.field === "googlePlaceId" &&
          fieldError.type === "duplicate",
      ) ?? false
    );
  }
  return false;
}

export function useShops(config?: SWRConfiguration<Shop[]>) {
  const resp = useSWR(
    ["/api/v1/shops"],
    () => {
      return withApiError("/api/v1/shops", async () => {
        const res = await apiClient.GET("/api/v1/shops");
        if (res.error) {
          throwApiError("/api/v1/shops", res.response, res.error);
        }

        // Load failures are shown inline by ShopsLoadState, not toasted.
        return res.data.shops.map(decorateShop);
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
            return apiError("/api/v1/auth/shops", res.response, res.error);
          }

          const added = decorateShop(res.data);
          mutate((current) => {
            if (!current) {
              return current;
            }

            return [...current, added];
          }, false);

          return apiOk(added);
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
            return apiError("/api/v1/auth/shops/{id}", res.response, res.error);
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
            // tagIds is not part of the Shop shape and tags cannot be derived
            // from ids here; the revalidation triggered below refreshes tags.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { tagIds: _tagIds, ...shopFields } = command;
            const copy = [...current];
            // Re-decorate so the cached date timestamps reflect the edited
            // openedAt/closedAt values, not the previous shop's.
            copy[i] = decorateShop({
              ...current[i],
              ...shopFields,
              favorite: isFavorite(command.eaten, command.rate),
            });
            return copy;
          }, true);

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
    get isLoading() {
      return resp.isLoading;
    },
    get error() {
      return resp.error as ApiError | undefined;
    },
    addShop,
    updateShop,
    mutate,
  };
}

export function useTags(config?: SWRConfiguration<Tag[]>) {
  const resp = useSWR(
    ["/api/v1/tags"],
    () => {
      return withApiError("/api/v1/tags", async () => {
        const res = await apiClient.GET("/api/v1/tags");
        if (res.error) {
          throwApiError("/api/v1/tags", res.response, res.error);
        }

        return res.data.tags;
      }).catch((err: ApiError) => {
        toastApiError(err, {
          fallbackTitle: "タグ一覧を読み込めませんでした",
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

  const saveTags = useCallback(
    (tags: TagInput[]) => {
      return withApiResult<Tag[], SaveTagsErrorBody>(
        "/api/v1/auth/tags",
        async () => {
          const res = await apiClient.PUT("/api/v1/auth/tags", {
            body: { tags },
          });
          if (res.error) {
            return apiError("/api/v1/auth/tags", res.response, res.error);
          }

          mutate(res.data.tags, false);

          return apiOk(res.data.tags);
        },
      );
    },
    [mutate],
  );

  return {
    get tags() {
      return resp.data;
    },
    get isLoading() {
      return resp.isLoading;
    },
    saveTags,
    mutate,
  };
}
