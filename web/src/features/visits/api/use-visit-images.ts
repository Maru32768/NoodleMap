import { useRevalidateShopVisits } from "@/features/visits/api/use-visits.ts";
import type { PreparedImage } from "@/features/visits/prepare-image.ts";
import type { components } from "@/generated/api.ts";
import {
  ApiErrorBodyFor,
  apiClient,
  apiError,
  apiOk,
  withApiResult,
} from "@/utils/request.ts";
import { useCallback } from "react";

export type VisitImage = components["schemas"]["VisitImage"];
type UploadVisitImageRequest = components["schemas"]["UploadVisitImageRequest"];
export type UploadVisitImageErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/visits/{visitId}/images",
  "post"
>;
export type UpdateVisitImageErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/visit-images/{imageId}",
  "put"
>;
type ReorderVisitImagesErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/visits/{visitId}/images/order",
  "put"
>;
type DeleteVisitImageErrorBody = ApiErrorBodyFor<
  "/api/v1/auth/visit-images/{imageId}",
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
function sleep(ms: number, signal: AbortSignal | undefined) {
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

function postImage(
  visitId: string,
  image: PreparedImage,
  signal: AbortSignal | undefined,
) {
  const form = new FormData();
  form.append("file", image.blob, image.fileName);
  return apiClient.POST("/api/v1/auth/visits/{visitId}/images", {
    params: { path: { visitId } },
    signal,
    // openapi-fetch sends a FormData as is (the browser sets the boundary);
    // the generated type models the file part as a string.
    body: form as unknown as UploadVisitImageRequest,
  });
}

/**
 * Admin writes to 訪問画像. Each success refetches the shop's visits; a reorder
 * or delete also the shop list (代表写真). Uploads leave the shop list to
 * `revalidateShops`, called once a batch of uploads is done.
 */
export function useVisitImageMutations(shopId: string) {
  const revalidate = useRevalidateShopVisits(shopId);

  /**
   * Adds one image at the end of the visit's images; a busy server is retried
   * once after Retry-After. `signal` aborts the whole upload.
   */
  const uploadImage = useCallback(
    (visitId: string, image: PreparedImage, signal?: AbortSignal) =>
      withApiResult<VisitImage, UploadVisitImageErrorBody>(
        "/api/v1/auth/visits/{visitId}/images",
        async () => {
          let res = await postImage(visitId, image, signal);
          if (res.error?.type === "visit_image_processing_busy") {
            await sleep(retryAfterMs(res.response.headers), signal);
            res = await postImage(visitId, image, signal);
          }
          if (res.error || !res.response.ok) {
            if (
              res.error?.type === "not_found" ||
              res.error?.type === "visit_image_limit_reached"
            ) {
              // The visit is gone or has images added elsewhere.
              await revalidate.visits();
            }
            return apiError(
              "/api/v1/auth/visits/{visitId}/images",
              res.response,
              res.error,
            );
          }
          await revalidate.visits();
          return apiOk(res.data);
        },
      ),
    [revalidate],
  );

  /** Saves the caption trimmed; a blank one clears it. Captions are not in the shop list. */
  const updateCaption = useCallback(
    (imageId: string, caption: string) =>
      withApiResult<VisitImage, UpdateVisitImageErrorBody>(
        "/api/v1/auth/visit-images/{imageId}",
        async () => {
          const res = await apiClient.PUT(
            "/api/v1/auth/visit-images/{imageId}",
            {
              params: { path: { imageId } },
              body: { caption: caption.trim() || undefined },
            },
          );
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              await revalidate.visits();
            }
            return apiError(
              "/api/v1/auth/visit-images/{imageId}",
              res.response,
              res.error,
            );
          }
          await revalidate.visits();
          return apiOk(res.data);
        },
      ),
    [revalidate],
  );

  /** Replaces the display order with `imageIds`, every image of the visit exactly once. */
  const reorderImages = useCallback(
    (visitId: string, imageIds: string[]) =>
      withApiResult<VisitImage[], ReorderVisitImagesErrorBody>(
        "/api/v1/auth/visits/{visitId}/images/order",
        async () => {
          const res = await apiClient.PUT(
            "/api/v1/auth/visits/{visitId}/images/order",
            { params: { path: { visitId } }, body: { imageIds } },
          );
          if (res.error || !res.response.ok) {
            // Stale ids (an image added or deleted elsewhere) or a deleted visit.
            if (
              res.error?.type === "not_found" ||
              res.error?.type === "invalid_request"
            ) {
              await revalidate.all();
            }
            return apiError(
              "/api/v1/auth/visits/{visitId}/images/order",
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
      withApiResult<void, DeleteVisitImageErrorBody>(
        "/api/v1/auth/visit-images/{imageId}",
        async () => {
          const res = await apiClient.DELETE(
            "/api/v1/auth/visit-images/{imageId}",
            { params: { path: { imageId } } },
          );
          if (res.error || !res.response.ok) {
            if (res.error?.type === "not_found") {
              await revalidate.all();
            }
            return apiError(
              "/api/v1/auth/visit-images/{imageId}",
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
    revalidateShops: revalidate.shops,
  };
}
