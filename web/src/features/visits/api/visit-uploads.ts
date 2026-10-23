import type {
  UploadVisitImageErrorBody,
  VisitImage,
} from "@/features/visits/api/use-visit-images.ts";
import {
  PreparedImage,
  prepareImageForUpload,
} from "@/features/visits/prepare-image.ts";
import type { ApiMutationResult } from "@/utils/request.ts";
import {
  VISIT_IMAGE_LIMIT_MESSAGE,
  VISIT_IMAGE_UNDECODABLE_MESSAGE,
  VISIT_IMAGE_UPLOAD_UNCONFIRMED_MESSAGE,
  visitImageUploadErrorMessage,
} from "@/utils/toast.ts";
import { useMemo, useSyncExternalStore } from "react";

/**
 * A selected file until it is uploaded (it then shows as an image) or failed.
 * Kept outside React so uploads and their failures survive the editor
 * remounting (opening a visit form, closing the modal). Only a `waiting`
 * file can be cancelled.
 */
export interface PendingUpload {
  key: number;
  shopId: string;
  visitId: string;
  name: string;
  status: "waiting" | "preparing" | "converting" | "uploading" | "failed";
  message?: string;
}

export type UploadImage = (
  visitId: string,
  image: PreparedImage,
  options: { signal: AbortSignal; timeoutMs: number },
) => Promise<ApiMutationResult<VisitImage, UploadVisitImageErrorBody>>;

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

let pending: readonly PendingUpload[] = [];
const listeners = new Set<() => void>();
let nextKey = 0;
// Visits with an image (possibly) uploaded since their queue last drained.
const uploadedVisits = new Set<string>();
// Aborts every running upload on reset.
let session = new AbortController();

function setPending(next: readonly PendingUpload[]) {
  pending = next;
  for (const listener of listeners) {
    listener();
  }
}

const find = (key: number) => pending.find((p) => p.key === key);

function patch(key: number, change: Partial<PendingUpload>) {
  setPending(pending.map((p) => (p.key === key ? { ...p, ...change } : p)));
}

function remove(key: number) {
  setPending(pending.filter((p) => p.key !== key));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isActive = (p: PendingUpload) => p.status !== "failed";

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every task queued before it: one upload at a time, as the server holds few. */
function enqueue(task: () => Promise<void>) {
  queue = queue.then(task).catch(() => undefined);
}

/**
 * Queues `files` for the visit with `slots` images still allowed; the rest
 * fail with the limit message. After an upload whose outcome is unknown
 * (aborted, network failure) `revalidateVisits` runs, since the server may
 * have saved it. Once the visit has nothing left in flight and an image was
 * (possibly) added, `onDrained` runs. Neither is awaited.
 */
export function queueVisitUploads({
  shopId,
  visitId,
  files,
  slots,
  upload,
  revalidateVisits,
  onDrained,
}: {
  shopId: string;
  visitId: string;
  files: readonly File[];
  slots: number;
  upload: UploadImage;
  revalidateVisits: () => void;
  onDrained: () => void;
}) {
  const entries = files.map((file, i) => ({
    file,
    entry: {
      key: nextKey++,
      shopId,
      visitId,
      name: file.name,
      ...(i < slots
        ? { status: "waiting" as const }
        : { status: "failed" as const, message: VISIT_IMAGE_LIMIT_MESSAGE }),
    } satisfies PendingUpload,
  }));
  setPending([...pending, ...entries.map((e) => e.entry)]);
  for (const { file, entry } of entries) {
    if (entry.status === "waiting") {
      enqueue(async () => {
        try {
          await run(entry.key, file, upload, revalidateVisits);
        } finally {
          drainCheck(visitId, onDrained);
        }
      });
    }
  }
}

async function run(
  key: number,
  file: File,
  upload: UploadImage,
  revalidateVisits: () => void,
) {
  const entry = find(key);
  if (entry?.status !== "waiting") {
    // Cancelled while queued.
    return;
  }
  // No longer cancellable from here on.
  patch(key, { status: "preparing" });
  const { signal } = session;
  // A canvas failure (out of memory, ...) must not leave the file pending.
  const prepared = await prepareImageForUpload(file, () => {
    if (find(key)) {
      patch(key, { status: "converting" });
    }
  }).catch(() => null);
  // Gone: the store was reset (logout).
  if (!find(key) || signal.aborted) {
    return;
  }
  if (!prepared?.ok) {
    patch(key, { status: "failed", message: VISIT_IMAGE_UNDECODABLE_MESSAGE });
    return;
  }
  patch(key, { status: "uploading" });
  const result = await upload(entry.visitId, prepared.data, {
    signal,
    timeoutMs: uploadTimeoutMs(prepared.data.blob.size),
  });
  if (!find(key)) {
    return;
  }
  if (result.ok) {
    uploadedVisits.add(entry.visitId);
    remove(key);
    return;
  }
  if (result.error.status === 0) {
    // Aborted or cut off: the server may still have saved the image.
    uploadedVisits.add(entry.visitId);
    revalidateVisits();
    patch(key, {
      status: "failed",
      message: VISIT_IMAGE_UPLOAD_UNCONFIRMED_MESSAGE,
    });
    return;
  }
  patch(key, {
    status: "failed",
    message: visitImageUploadErrorMessage(result.error),
  });
}

function drainCheck(visitId: string, onDrained: () => void) {
  const inFlight = pending.some((p) => p.visitId === visitId && isActive(p));
  if (!inFlight && uploadedVisits.delete(visitId)) {
    onDrained();
  }
}

/** Drops a queued file before its upload starts. */
export function cancelUpload(key: number) {
  if (find(key)?.status === "waiting") {
    remove(key);
  }
}

/** Hides a failed file. */
export function dismissUpload(key: number) {
  if (find(key)?.status === "failed") {
    remove(key);
  }
}

/** Drops the shop's failed files of visits that no longer exist. */
export function purgeFailedUploads(
  shopId: string,
  visitIds: readonly string[],
) {
  const next = pending.filter(
    (p) => p.shopId !== shopId || isActive(p) || visitIds.includes(p.visitId),
  );
  if (next.length !== pending.length) {
    setPending(next);
  }
}

/** Forgets every file and aborts the running upload (on logout, and between tests). */
export function resetVisitUploads() {
  session.abort();
  session = new AbortController();
  uploadedVisits.clear();
  setPending([]);
}

/** The visit's files still uploading or failed, in selection order. */
export function useVisitUploads(visitId: string): PendingUpload[] {
  const all = useSyncExternalStore(subscribe, () => pending);
  return all.filter((p) => p.visitId === visitId);
}

/** Whether any of the shop's visits has an upload queued or in flight. */
export function useShopUploading(shopId: string): boolean {
  return useSyncExternalStore(subscribe, () =>
    pending.some((p) => p.shopId === shopId && isActive(p)),
  );
}

/** The shop's visits with an upload queued or in flight. */
export function useUploadingVisitIds(shopId: string): ReadonlySet<string> {
  // A string snapshot: a new Set per read would never be equal.
  const ids = useSyncExternalStore(subscribe, () =>
    [
      ...new Set(
        pending
          .filter((p) => p.shopId === shopId && isActive(p))
          .map((p) => p.visitId),
      ),
    ].join(","),
  );
  return useMemo(() => new Set(ids ? ids.split(",") : []), [ids]);
}
