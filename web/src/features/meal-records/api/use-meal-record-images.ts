import {
  MealRecord,
  useRevalidateRecords,
} from "@/features/meal-records/api/use-meal-records.ts";
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

const UPLOAD_TIMEOUT_BASE_MS = 30_000;
// A slow mobile uplink; a request slower than this is treated as stalled.
const UPLOAD_MIN_BYTES_PER_SECOND = 50 * 1024;

/** How long one upload request of `bytes` may take before it is aborted. */
export function uploadTimeoutMs(bytes: number): number {
  return (
    UPLOAD_TIMEOUT_BASE_MS +
    Math.ceil((bytes / UPLOAD_MIN_BYTES_PER_SECOND) * 1000)
  );
}

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

/** The meal record's images as the server has them now; undefined when they could not be read. */
async function readMealRecordImages({
  id,
  shops,
  venue,
}: Pick<MealRecord, "id" | "shops" | "venue">) {
  // There is no read of one meal record: list its first shop's, or its venue's
  // (a record without shops always has one).
  const signal = AbortSignal.timeout(UPLOAD_TIMEOUT_BASE_MS);
  const read =
    shops.length > 0
      ? apiClient.GET("/api/v1/shops/{id}/meal-records", {
          params: { path: { id: shops[0].id } },
          signal,
        })
      : venue &&
        apiClient.GET("/api/v1/venues/{venueId}/meal-records", {
          params: { path: { venueId: venue.id } },
          signal,
        });
  const res = await read?.catch(() => undefined);
  return res?.data?.mealRecords.find((record) => record.id === id)?.images;
}

/**
 * Admin writes to 記録の画像. None refetches anything: a batch of them ends with one
 * `revalidate` (the meal records and the shop list's 代表写真), failures
 * included. `readImages` is for an upload that could not be confirmed.
 */
export function useMealRecordImageMutations() {
  const revalidate = useRevalidateRecords().all;

  /** Saves the caption trimmed; a blank one clears it. */
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
            return apiError(
              "/api/v1/auth/meal-record-images/{imageId}",
              res.response,
              res.error,
            );
          }
          return apiOk(res.data);
        },
      ),
    [],
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
            return apiError(
              "/api/v1/auth/meal-records/{mealRecordId}/images/order",
              res.response,
              res.error,
            );
          }
          return apiOk(res.data.images);
        },
      ),
    [],
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
            return apiError(
              "/api/v1/auth/meal-record-images/{imageId}",
              res.response,
              res.error,
            );
          }
          return apiOk(undefined);
        },
      ),
    [],
  );

  return {
    uploadImage: uploadMealRecordImage,
    updateCaption,
    reorderImages,
    deleteImage,
    readImages: readMealRecordImages,
    revalidate,
  };
}
