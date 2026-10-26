import { useRevalidateRecords } from "@/features/meal-records/api/use-meal-records.ts";
import type { PreparedImage } from "@/features/meal-records/prepare-image.ts";
import type { components } from "@/generated/api.ts";
import {
  ApiErrorBodyFor,
  apiClient,
  apiError,
  apiOk,
  withApiResult,
} from "@/utils/request.ts";
import { useCallback } from "react";

export type MealRecordImage = components["schemas"]["MealRecordImage"];
type UploadMealRecordImageRequest =
  components["schemas"]["UploadMealRecordImageRequest"];
export type UploadMealRecordImageErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/meal-records/{mealRecordId}/images",
  "post"
>;
export type UpdateMealRecordImageErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/meal-record-images/{imageId}",
  "put"
>;
type ReorderMealRecordImagesErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/meal-records/{mealRecordId}/images/order",
  "put"
>;
type DeleteMealRecordImageErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/meal-record-images/{imageId}",
  "delete"
>;

const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 30_000;

/** How long a 503 asked to wait (Retry-After in seconds), bounded; 5 s when it did not say. */
export function retryAfterMs(headers: Headers): number {
  const value = headers.get("Retry-After")?.trim();
  const seconds = value ? Number(value) : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RETRY_AFTER_MS;
  }
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/** Waits `ms`; rejects as soon as `signal` aborts. */
export function sleep(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** One upload request, aborted by `signal` or after `timeoutMs`. */
async function postImage(
  mealRecordId: string,
  image: PreparedImage,
  { signal, timeoutMs }: UploadOptions,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  const timer =
    timeoutMs === undefined ? undefined : setTimeout(abort, timeoutMs);
  try {
    if (signal?.aborted) {
      abort();
    }
    const form = new FormData();
    form.append("file", image.blob, image.fileName);
    return await apiClient.POST(
      "/api/v1/auth/meal-records/{mealRecordId}/images",
      {
        params: { path: { mealRecordId } },
        signal: controller.signal,
        // openapi-fetch sends a FormData as is (the browser sets the boundary);
        // the generated type models the file part as a string.
        body: form as unknown as UploadMealRecordImageRequest,
      },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export interface UploadOptions {
  // Aborts the whole upload, the busy-server wait included.
  signal?: AbortSignal;
  // Limits each request; the busy-server wait between them does not count.
  timeoutMs?: number;
}

/**
 * Adds one image at the end of the meal record's images; a busy server is retried
 * once after Retry-After. An aborted or timed-out request fails as a network
 * error (status 0): the server may still have saved the image.
 */
export function uploadMealRecordImage(
  mealRecordId: string,
  image: PreparedImage,
  options: UploadOptions = {},
) {
  return withApiResult<MealRecordImage, UploadMealRecordImageErrorBody>(
    "/api/v1/auth/meal-records/{mealRecordId}/images",
    async () => {
      let res = await postImage(mealRecordId, image, options);
      if (res.error?.type === "meal_record_image_processing_busy") {
        await sleep(retryAfterMs(res.response.headers), options.signal);
        res = await postImage(mealRecordId, image, options);
      }
      if (res.error || !res.response.ok) {
        return apiError(
          "/api/v1/auth/meal-records/{mealRecordId}/images",
          res.response,
          res.error,
        );
      }
      return apiOk(res.data);
    },
  );
}

/**
 * Admin writes to 記録の画像. Each success refetches the shop's meal records; a reorder
 * or delete also the shop list (代表写真). Uploads leave the shop list to
 * `revalidateShops`, called once a batch of uploads is done.
 */
export function useMealRecordImageMutations() {
  const revalidate = useRevalidateRecords();

  const uploadImage = useCallback(
    async (
      mealRecordId: string,
      image: PreparedImage,
      options: UploadOptions = {},
    ) => {
      const result = await uploadMealRecordImage(mealRecordId, image, options);
      if (
        result.ok ||
        // The meal record is gone or has images added elsewhere.
        result.error.type === "not_found" ||
        result.error.type === "meal_record_image_limit_reached"
      ) {
        await revalidate.mealRecords();
      }
      return result;
    },
    [revalidate],
  );

  /** Saves the caption trimmed; a blank one clears it. Captions are not in the shop list. */
  const updateCaption = useCallback(
    (imageId: string, caption: string) =>
      withApiResult<MealRecordImage, UpdateMealRecordImageErrorBody>(
        "/api/v1/auth/meal-record-images/{imageId}",
        async () => {
          const res = await apiClient.PUT(
            "/api/v1/auth/meal-record-images/{imageId}",
            {
              params: { path: { imageId } },
              body: { caption: caption.trim() || undefined },
            },
          );
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              await revalidate.mealRecords();
            }
            return apiError(
              "/api/v1/auth/meal-record-images/{imageId}",
              res.response,
              res.error,
            );
          }
          await revalidate.mealRecords();
          return apiOk(res.data);
        },
      ),
    [revalidate],
  );

  /** Replaces the display order with `imageIds`, every image of the mealRecord exactly once. */
  const reorderImages = useCallback(
    (mealRecordId: string, imageIds: string[]) =>
      withApiResult<MealRecordImage[], ReorderMealRecordImagesErrorBody>(
        "/api/v1/auth/meal-records/{mealRecordId}/images/order",
        async () => {
          const res = await apiClient.PUT(
            "/api/v1/auth/meal-records/{mealRecordId}/images/order",
            { params: { path: { mealRecordId } }, body: { imageIds } },
          );
          if (res.error || !res.response.ok) {
            // Stale ids (an image added or deleted elsewhere) or a deleted mealRecord.
            if (
              res.error?.type === "not_found" ||
              res.error?.type === "invalid_request"
            ) {
              await revalidate.all();
            }
            return apiError(
              "/api/v1/auth/meal-records/{mealRecordId}/images/order",
              res.response,
              res.error,
            );
          }
          await revalidate.all();
          return apiOk(res.data.images);
        },
      ),
    [revalidate],
  );

  const deleteImage = useCallback(
    (imageId: string) =>
      withApiResult<void, DeleteMealRecordImageErrorBody>(
        "/api/v1/auth/meal-record-images/{imageId}",
        async () => {
          const res = await apiClient.DELETE(
            "/api/v1/auth/meal-record-images/{imageId}",
            { params: { path: { imageId } } },
          );
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              await revalidate.all();
            }
            return apiError(
              "/api/v1/auth/meal-record-images/{imageId}",
              res.response,
              res.error,
            );
          }
          await revalidate.all();
          return apiOk(undefined);
        },
      ),
    [revalidate],
  );

  return {
    uploadImage,
    updateCaption,
    reorderImages,
    deleteImage,
    revalidateMealRecords: revalidate.mealRecords,
    revalidateShops: revalidate.shops,
  };
}
