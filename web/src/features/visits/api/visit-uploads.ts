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
  VISIT_IMAGE_UPLOAD_TIMEOUT_MESSAGE,
  visitImageUploadErrorMessage,
} from "@/utils/toast.ts";
import { useSyncExternalStore } from "react";

/**
 * A selected file until it is uploaded (it then shows as an image) or failed.
 * Kept outside React so uploads and their failures survive the editor
 * remounting (opening a visit form, closing the modal).
 */
export interface PendingUpload {
  key: number;
  shopId: string;
  visitId: string;
  name: string;
  status: "waiting" | "converting" | "uploading" | "failed";
  message?: string;
}

export type UploadImage = (
  visitId: string,
  image: PreparedImage,
  signal: AbortSignal,
) => Promise<ApiMutationResult<VisitImage, UploadVisitImageErrorBody>>;

// A stalled upload fails after this, so it never blocks the queue for good.
// It covers a busy server's Retry-After wait and the retry.
export const UPLOAD_TIMEOUT_MS = 90_000;

let pending: readonly PendingUpload[] = [];
const listeners = new Set<() => void>();
let nextKey = 0;
// Visits with an image uploaded since their queue last drained.
const uploadedVisits = new Set<string>();

function setPending(next: readonly PendingUpload[]) {
  pending = next;
  for (const listener of listeners) {
    listener();
  }
}

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
 * fail with the limit message. Once the visit has no upload left in flight
 * and at least one succeeded, `onDrained` runs (not awaited).
 */
export function queueVisitUploads({
  shopId,
  visitId,
  files,
  slots,
  upload,
  onDrained,
  timeoutMs = UPLOAD_TIMEOUT_MS,
}: {
  shopId: string;
  visitId: string;
  files: readonly File[];
  slots: number;
  upload: UploadImage;
  onDrained: () => void;
  timeoutMs?: number;
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
          await run(entry.key, file, upload, timeoutMs);
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
  timeoutMs: number,
) {
  const entry = pending.find((p) => p.key === key);
  if (entry?.status !== "waiting") {
    // Cancelled while queued.
    return;
  }
  // A canvas failure (out of memory, ...) must not leave the file pending.
  const prepared = await prepareImageForUpload(file, () =>
    patch(key, { status: "converting" }),
  ).catch(() => null);
  if (!prepared?.ok) {
    patch(key, { status: "failed", message: VISIT_IMAGE_UNDECODABLE_MESSAGE });
    return;
  }
  patch(key, { status: "uploading" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await upload(
      entry.visitId,
      prepared.data,
      controller.signal,
    );
    if (result.ok) {
      uploadedVisits.add(entry.visitId);
      remove(key);
    } else {
      patch(key, {
        status: "failed",
        message: controller.signal.aborted
          ? VISIT_IMAGE_UPLOAD_TIMEOUT_MESSAGE
          : visitImageUploadErrorMessage(result.error),
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

function drainCheck(visitId: string, onDrained: () => void) {
  const inFlight = pending.some((p) => p.visitId === visitId && isActive(p));
  if (!inFlight && uploadedVisits.delete(visitId)) {
    onDrained();
  }
}

/** Drops a queued file before its upload starts. */
export function cancelUpload(key: number) {
  if (pending.find((p) => p.key === key)?.status === "waiting") {
    remove(key);
  }
}

/** Hides a failed file. */
export function dismissUpload(key: number) {
  if (pending.find((p) => p.key === key)?.status === "failed") {
    remove(key);
  }
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
