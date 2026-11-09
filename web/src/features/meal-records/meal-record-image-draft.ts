import {
  MealRecordImage,
  uploadTimeoutMs,
  useMealRecordImageMutations,
} from "@/features/meal-records/api/use-meal-record-images.ts";
import type { MealRecord } from "@/features/meal-records/api/use-meal-records.ts";
import {
  PreparedImage,
  prepareImageForUpload,
} from "@/features/meal-records/prepare-image.ts";
import { invalidRequestFieldErrors } from "@/utils/request.ts";
import {
  MEAL_RECORD_IMAGE_ALREADY_DELETED_TITLE,
  MEAL_RECORD_IMAGE_CAPTION_FAILED_TITLE,
  MEAL_RECORD_IMAGE_DELETE_FAILED_TITLE,
  MEAL_RECORD_IMAGE_DRAFT_UPLOAD_UNCONFIRMED_MESSAGE,
  MEAL_RECORD_IMAGE_LIMIT_MESSAGE,
  MEAL_RECORD_IMAGE_REORDER_FAILED_TITLE,
  MEAL_RECORD_IMAGE_UNDECODABLE_MESSAGE,
  MEAL_RECORD_IMAGES_MAX,
  mealRecordImageCaptionErrorMessage,
  mealRecordImageUploadErrorMessage,
  toastApiError,
  toastError,
} from "@/utils/toast.ts";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useRef, useState } from "react";

export type ImageDraftItem =
  | {
      kind: "saved";
      key: string;
      image: MealRecordImage;
      caption: string;
      error?: string;
    }
  | ({
      kind: "new";
      key: string;
      name: string;
      caption: string;
      error?: string;
    } & (
      | { status: "preparing" }
      | {
          status: "ready" | "uploading";
          prepared: PreparedImage;
          previewUrl: string;
        }
    ));

/**
 * `items` is the list as shown, in display order. `baseline` is what the server
 * has: a saved image in it but not in `items` is one to delete.
 */
interface DraftState {
  items: ImageDraftItem[];
  baseline: MealRecordImage[];
}

// The saved record `commit` writes to; its shops or venue let it re-read the images.
type SavedRecord = Pick<MealRecord, "id" | "shops" | "venue">;

let nextNewKey = 0;

const savedItemOf = (image: MealRecordImage): ImageDraftItem => ({
  kind: "saved",
  key: image.id,
  image,
  caption: image.caption ?? "",
});

const savedIdsOf = (items: readonly ImageDraftItem[]) =>
  items.flatMap((item) => (item.kind === "saved" ? [item.image.id] : []));

function isChanged({ items, baseline }: DraftState) {
  return (
    items.length !== baseline.length ||
    items.some(
      (item, i) =>
        item.kind === "new" ||
        item.image.id !== baseline[i].id ||
        item.caption.trim() !== (baseline[i].caption ?? ""),
    )
  );
}

/**
 * The 記録の画像 of a 食べた記録 form as a draft: nothing reaches the server until
 * `commit`, which converges the server on the list and can run again after a
 * partial failure. It resolves to whether everything was saved.
 */
export function useMealRecordImageDraft(images: readonly MealRecordImage[]) {
  const {
    uploadImage,
    updateCaption,
    reorderImages,
    deleteImage,
    readImages,
    revalidate,
  } = useMealRecordImageMutations();
  const [state, setState] = useState<DraftState>(() => ({
    items: images.map(savedItemOf),
    baseline: [...images],
  }));
  // `commit` and `add` run across renders and must see each other's changes.
  const latest = useRef(state);
  const update = useCallback((change: (state: DraftState) => DraftState) => {
    latest.current = change(latest.current);
    setState(latest.current);
  }, []);
  const updateItem = useCallback(
    (key: string, change: (item: ImageDraftItem) => ImageDraftItem) =>
      update((state) => ({
        ...state,
        items: state.items.map((item) =>
          item.key === key ? change(item) : item,
        ),
      })),
    [update],
  );
  const dropItem = useCallback(
    (key: string) =>
      update((state) => ({
        ...state,
        items: state.items.filter((item) => item.key !== key),
      })),
    [update],
  );

  // A prepare still running at unmount must not create a preview nobody revokes.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const item of latest.current.items) {
        if (item.kind === "new" && item.status !== "preparing") {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, []);

  const isListed = useCallback(
    (key: string) =>
      mounted.current && latest.current.items.some((item) => item.key === key),
    [],
  );

  const prepare = useCallback(
    async (key: string, file: File) => {
      if (!isListed(key)) {
        return;
      }
      // A canvas failure (out of memory, ...) counts as undecodable too.
      const prepared = await prepareImageForUpload(file).catch(() => null);
      if (!isListed(key)) {
        return;
      }
      if (!prepared?.ok) {
        dropItem(key);
        toastError({
          title: MEAL_RECORD_IMAGE_UNDECODABLE_MESSAGE,
          description: file.name,
        });
        return;
      }
      const previewUrl = URL.createObjectURL(prepared.data.blob);
      updateItem(key, (item) =>
        item.kind === "new"
          ? { ...item, status: "ready", prepared: prepared.data, previewUrl }
          : item,
      );
    },
    [dropItem, isListed, updateItem],
  );

  // One at a time: decoding several large photos at once can run out of memory.
  const preparing = useRef(Promise.resolve());
  const add = useCallback(
    (files: readonly File[]) => {
      const free = MEAL_RECORD_IMAGES_MAX - latest.current.items.length;
      const accepted = files.slice(0, Math.max(0, free)).map((file) => ({
        file,
        key: `new-${nextNewKey++}`,
      }));
      const refused = files.slice(accepted.length);
      if (refused.length > 0) {
        toastError({
          title: MEAL_RECORD_IMAGE_LIMIT_MESSAGE,
          description: refused.map((file) => file.name).join("、"),
        });
      }
      update((state) => ({
        ...state,
        items: [
          ...state.items,
          ...accepted.map(({ file, key }) => ({
            kind: "new" as const,
            key,
            name: file.name,
            caption: "",
            status: "preparing" as const,
          })),
        ],
      }));
      for (const { file, key } of accepted) {
        preparing.current = preparing.current.then(() => prepare(key, file));
      }
    },
    [prepare, update],
  );

  const remove = useCallback(
    (key: string) => {
      const item = latest.current.items.find((item) => item.key === key);
      if (item?.kind === "new" && item.status !== "preparing") {
        URL.revokeObjectURL(item.previewUrl);
      }
      dropItem(key);
    },
    [dropItem],
  );

  const move = useCallback(
    (index: number, delta: number) =>
      update((state) => {
        const items = [...state.items];
        const [item] = items.splice(index, 1);
        items.splice(index + delta, 0, item);
        return { ...state, items };
      }),
    [update],
  );

  const setCaption = useCallback(
    (key: string, caption: string) =>
      updateItem(key, (item) => ({
        ...item,
        caption,
        // An upload's error is not about its caption.
        error: item.kind === "saved" ? undefined : item.error,
      })),
    [updateItem],
  );

  // The images the server has that the baseline lacks; undefined when unreadable.
  const unknownImages = async (mealRecord: SavedRecord) => {
    const images = await readImages(mealRecord);
    const known = new Set(latest.current.baseline.map((image) => image.id));
    return images?.filter((image) => !known.has(image.id));
  };

  const commit = async (mealRecord: SavedRecord) => {
    const mealRecordId = mealRecord.id;
    let complete = true;
    let sent = false;

    let deleteFailed = false;
    const listed = new Set(savedIdsOf(latest.current.items));
    for (const image of latest.current.baseline) {
      if (listed.has(image.id)) {
        continue;
      }
      sent = true;
      const result = await deleteImage(image.id);
      if (result.ok || result.error.type === "not_found") {
        update((state) => ({
          ...state,
          baseline: state.baseline.filter((other) => other.id !== image.id),
        }));
      } else {
        deleteFailed = true;
        toastApiError(result.error, {
          fallbackTitle: MEAL_RECORD_IMAGE_DELETE_FAILED_TITLE,
        });
      }
    }
    complete &&= !deleteFailed;

    for (const item of latest.current.items) {
      if (item.kind !== "new" || item.status === "preparing") {
        continue;
      }
      sent = true;
      updateItem(item.key, () => ({
        ...item,
        status: "uploading",
        error: undefined,
      }));
      // An unconfirmed try may have been stored after its re-read: sending it
      // again would leave the server a second copy.
      const storedSince =
        item.error === MEAL_RECORD_IMAGE_DRAFT_UPLOAD_UNCONFIRMED_MESSAGE
          ? await unknownImages(mealRecord)
          : [];
      if (!storedSince) {
        // Unreadable, so it stays unconfirmed for the next save rather than risk a second copy.
        complete = false;
        updateItem(item.key, () => item);
        break;
      }
      const result =
        storedSince.length > 0
          ? undefined
          : await uploadImage(mealRecordId, item.prepared, {
              timeoutMs: uploadTimeoutMs(item.prepared.blob.size),
            });
      // Aborted or cut off: the server may still have saved the image.
      const unconfirmed = result?.ok === false && result.error.status === 0;
      // Unconfirmed, the last image the server has beyond the baseline is this
      // upload, and any before it an earlier unconfirmed try: all are listed as
      // saved, so neither a retry nor a reorder works from a short baseline.
      const stored = !result
        ? storedSince
        : result.ok
          ? [result.data]
          : unconfirmed
            ? ((await unknownImages(mealRecord)) ?? [])
            : [];
      if (stored.length > 0) {
        URL.revokeObjectURL(item.previewUrl);
        const image = stored[stored.length - 1];
        update((state) => ({
          items: state.items.flatMap((other) =>
            other.key === item.key
              ? [
                  ...stored.slice(0, -1).map(savedItemOf),
                  {
                    kind: "saved",
                    key: item.key,
                    image,
                    caption: item.caption,
                  },
                ]
              : [other],
          ),
          baseline: [...state.baseline, ...stored],
        }));
      } else if (result?.ok === false) {
        complete = false;
        updateItem(item.key, () => ({
          ...item,
          status: "ready",
          error: unconfirmed
            ? MEAL_RECORD_IMAGE_DRAFT_UPLOAD_UNCONFIRMED_MESSAGE
            : mealRecordImageUploadErrorMessage(result.error),
        }));
      }
      if (unconfirmed) {
        // On a stalled uplink each further upload would wait out its own
        // timeout with the form locked: they stay for the next save.
        complete &&= latest.current.items.every(
          (other) => other.kind === "saved",
        );
        break;
      }
    }

    for (const item of latest.current.items) {
      if (item.kind !== "saved") {
        continue;
      }
      const caption = item.caption.trim();
      const saved = latest.current.baseline.find(
        (image) => image.id === item.image.id,
      );
      if (caption === (saved?.caption ?? "")) {
        continue;
      }
      sent = true;
      const result = await updateCaption(item.image.id, caption);
      if (result.ok) {
        update((state) => ({
          items: state.items.map((other) =>
            other.key === item.key
              ? { ...item, image: result.data, caption, error: undefined }
              : other,
          ),
          baseline: state.baseline.map((image) =>
            image.id === item.image.id ? result.data : image,
          ),
        }));
        continue;
      }
      if (result.error.type === "not_found") {
        update((state) => ({
          items: state.items.filter((other) => other.key !== item.key),
          baseline: state.baseline.filter(
            (image) => image.id !== item.image.id,
          ),
        }));
        toastError({ title: MEAL_RECORD_IMAGE_ALREADY_DELETED_TITLE });
        continue;
      }
      complete = false;
      const captionError = invalidRequestFieldErrors(result.error.body)?.find(
        (error) => error.field === "caption",
      );
      if (captionError) {
        updateItem(item.key, (current) => ({
          ...current,
          error: mealRecordImageCaptionErrorMessage(captionError.type),
        }));
      } else {
        toastApiError(result.error, {
          fallbackTitle: MEAL_RECORD_IMAGE_CAPTION_FAILED_TITLE,
        });
      }
    }

    // A reorder must name every image of the record exactly once.
    const { items, baseline } = latest.current;
    const imageIds = savedIdsOf(items);
    if (
      imageIds.length === items.length &&
      !deleteFailed &&
      !isEqual(
        imageIds,
        baseline.map((image) => image.id),
      )
    ) {
      sent = true;
      const result = await reorderImages(mealRecordId, imageIds);
      if (result.ok) {
        update((state) => ({ ...state, baseline: result.data }));
      } else {
        complete = false;
        toastApiError(result.error, {
          fallbackTitle: MEAL_RECORD_IMAGE_REORDER_FAILED_TITLE,
        });
      }
    }

    // Once per save, failures included: a failure can mean the views are stale.
    if (sent) {
      await revalidate();
    }
    return complete;
  };

  return {
    items: state.items,
    add,
    remove,
    move,
    setCaption,
    changed: isChanged(state),
    preparing: state.items.some(
      (item) => item.kind === "new" && item.status === "preparing",
    ),
    commit,
  };
}

export type ImageDraft = ReturnType<typeof useMealRecordImageDraft>;
