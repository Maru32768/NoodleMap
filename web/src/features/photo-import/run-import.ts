import {
  decideAction,
  ImportPlan,
  PlanEntry,
} from "@/features/photo-import/import-plan.ts";
import {
  RunOutcome,
  RunProgress,
  runProgressOf,
} from "@/features/photo-import/import-state.ts";
import type { Photo } from "@/features/photo-import/photos.ts";
import {
  retryAfterMs,
  sleep,
  uploadVisitImage,
} from "@/features/visits/api/use-visit-images.ts";
import {
  fetchVisits,
  postVisit,
  putVisit,
  visitInputOf,
  VisitLog,
} from "@/features/visits/api/use-visits.ts";
import { uploadTimeoutMs } from "@/features/visits/api/visit-uploads.ts";
import { prepareImageForUpload } from "@/features/visits/prepare-image.ts";
import { ApiError } from "@/utils/request.ts";
import { err } from "@/utils/result.ts";
import {
  apiErrorText,
  VISIT_IMAGE_UNDECODABLE_MESSAGE,
  VISIT_IMAGE_UPLOAD_UNCONFIRMED_MESSAGE,
  visitImageUploadErrorMessage,
} from "@/utils/toast.ts";

/** The server's own output size: no pixel beyond it survives the upload anyway. */
export const IMPORT_MAX_EDGE = 2048;
/** Extra tries of one photo while the server says it is busy, beyond uploadVisitImage's own. */
const MAX_BUSY_RETRIES = 5;
/** Fresh looks at one entry after an outcome only the server knows: status 0, a vanished claim. */
const MAX_REENTRIES = 2;

type Counted = "created" | "claimed" | "resumed" | "alreadyDone";
type Stop =
  | {
      readonly kind: "failed";
      readonly message: string;
      readonly unconfirmed: boolean;
    }
  | { readonly kind: "stopped" }
  | { readonly kind: "unauthorized" };
/** Look at the server again: the request may or may not have taken effect. */
const REENTER = "reenter";

const failed = (message: string, unconfirmed = false): Stop => ({
  kind: "failed",
  message,
  unconfirmed,
});

function stopOf(error: ApiError, signal: AbortSignal): Stop | typeof REENTER {
  if (error.status === 0) {
    return signal.aborted ? { kind: "stopped" } : REENTER;
  }
  return error.status === 401
    ? { kind: "unauthorized" }
    : failed(apiErrorText(error));
}

/**
 * Runs the plan one entry at a time and one upload at a time (the server decodes one image at a
 * time). Each entry: fetchVisits -> decideAction -> POST/PUT/nothing -> upload photos[m..n).
 * A failed entry is recorded and the run moves on. Retrying means running the same plan again:
 * there is no retry list, no local progress marker, nothing to resume from but the server.
 */
export async function runImport(
  plan: ImportPlan,
  options: { signal: AbortSignal; onProgress: (progress: RunProgress) => void },
): Promise<RunOutcome> {
  const { signal, onProgress } = options;
  let progress = runProgressOf(plan);
  const update = (change: Partial<RunProgress>) => {
    progress = { ...progress, ...change };
    onProgress(progress);
  };

  for (const entry of plan.entries) {
    if (signal.aborted) {
      return { kind: "stopped", progress };
    }
    const total = entry.photos.length;
    update({ current: { key: entry.key, uploaded: 0, total } });
    const end = await runEntry(entry, signal, (uploaded) =>
      update({
        uploadedImages: progress.uploadedImages + 1,
        current: { key: entry.key, uploaded, total },
      }),
    );
    if (end.kind === "stopped" || end.kind === "unauthorized") {
      return { kind: end.kind, progress };
    }
    update(
      end.kind === "failed"
        ? {
            finished: progress.finished + 1,
            failures: [
              ...progress.failures,
              {
                key: entry.key,
                message: end.message,
                unconfirmed: end.unconfirmed,
              },
            ],
          }
        : {
            finished: progress.finished + 1,
            [end.kind]: progress[end.kind] + 1,
          },
    );
  }
  update({ current: null });
  return { kind: "finished", progress };
}

async function runEntry(
  entry: PlanEntry,
  signal: AbortSignal,
  onUploaded: (uploaded: number) => void,
): Promise<{ readonly kind: Counted } | Stop> {
  // shortcut: two tabs running at once can both see no visit between the GET and the POST and create two, upgrade with a server idempotency key.
  // The first write this run sends decides how the entry counts, whatever a re-read finds later.
  let counted: Counted | undefined;
  for (let reads = 0; reads <= MAX_REENTRIES; reads++) {
    let visits: VisitLog[];
    try {
      visits = await fetchVisits(entry.shopId);
    } catch (error) {
      const stop = stopOf(error as ApiError, signal);
      if (stop === REENTER) {
        continue;
      }
      return stop;
    }

    const action = decideAction(entry, visits);
    let visitId: string;
    let uploaded: number;
    switch (action.kind) {
      case "done":
        return { kind: counted ?? "alreadyDone" };
      case "resume":
        counted ??= "resumed";
        visitId = action.visitId;
        uploaded = action.uploaded;
        break;
      case "create": {
        counted ??= "created";
        const result = await postVisit(entry.shopId, { visitedOn: entry.day });
        if (!result.ok) {
          const stop = stopOf(result.error, signal);
          if (stop === REENTER) {
            continue;
          }
          return stop;
        }
        visitId = result.data.id;
        uploaded = 0;
        break;
      }
      case "claim": {
        counted ??= "claimed";
        const result = await putVisit(action.visit.id, {
          ...visitInputOf(action.visit),
          visitedOn: entry.day,
        });
        if (!result.ok) {
          // not_found: the dateless visit was deleted meanwhile, so the next look creates one.
          const stop =
            result.error.type === "not_found"
              ? REENTER
              : stopOf(result.error, signal);
          if (stop === REENTER) {
            continue;
          }
          return stop;
        }
        visitId = action.visit.id;
        uploaded = 0;
        break;
      }
    }

    const end = await uploadFrom(
      visitId,
      entry.photos,
      uploaded,
      signal,
      onUploaded,
    );
    if (end === "uploaded") {
      return { kind: counted };
    }
    if (end !== REENTER) {
      return end;
    }
  }
  return failed(VISIT_IMAGE_UPLOAD_UNCONFIRMED_MESSAGE, true);
}

const prepare = (photo: Photo) =>
  prepareImageForUpload(photo.file, undefined, {
    maxEdge: IMPORT_MAX_EDGE,
  }).catch(() => err("undecodable" as const));

/**
 * Uploads photos[from..] in order, one at a time, so the visit's image count stays the number of
 * leading photos already stored: the cursor the next look at the server resumes from.
 */
async function uploadFrom(
  visitId: string,
  photos: readonly Photo[],
  from: number,
  signal: AbortSignal,
  onUploaded: (uploaded: number) => void,
): Promise<"uploaded" | typeof REENTER | Stop> {
  let next = from < photos.length ? prepare(photos[from]) : undefined;
  for (let i = from; i < photos.length; i++) {
    const prepared = await next!;
    // One ahead: the next photo is downscaled while this one uploads.
    next = i + 1 < photos.length ? prepare(photos[i + 1]) : undefined;
    if (signal.aborted) {
      return { kind: "stopped" };
    }
    // Named so the admin can exclude it: the count cursor cannot skip a photo, so every re-run stops here.
    const failedPhoto = (message: string) =>
      failed(`${photos[i].file.name}: ${message}`);
    if (!prepared.ok) {
      return failedPhoto(VISIT_IMAGE_UNDECODABLE_MESSAGE);
    }
    for (let busy = 0; ; busy++) {
      const result = await uploadVisitImage(visitId, prepared.data, {
        signal,
        timeoutMs: uploadTimeoutMs(prepared.data.blob.size),
      });
      if (result.ok) {
        onUploaded(i + 1);
        break;
      }
      if (
        result.error.type === "visit_image_processing_busy" &&
        busy < MAX_BUSY_RETRIES
      ) {
        try {
          await sleep(retryAfterMs(result.error.headers), signal);
        } catch {
          return { kind: "stopped" };
        }
        continue;
      }
      if (result.error.status === 0 || result.error.status === 401) {
        return stopOf(result.error, signal);
      }
      return failedPhoto(visitImageUploadErrorMessage(result.error));
    }
  }
  return "uploaded";
}
