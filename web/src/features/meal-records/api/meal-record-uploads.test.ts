import {
  cancelUpload,
  purgeFailedUploads,
  queueMealRecordUploads,
  resetMealRecordUploads,
  UploadImage,
  uploadTimeoutMs,
  useMealRecordUploads,
  useShopUploading,
  useUploadingMealRecordIds,
} from "@/features/meal-records/api/meal-record-uploads.ts";
import type { MealRecordImage } from "@/features/meal-records/api/use-meal-record-images.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { toApiError, toNetworkApiError } from "@/utils/request.ts";
import { err, ok } from "@/utils/result.ts";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  resetMealRecordUploads();
});

const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

const stored: MealRecordImage = {
  id: "00000000-0000-4000-8000-0000000003a1",
  url: "https://img.example.test/a.jpg",
  width: 320,
  height: 240,
};

function watch(shopId: string, mealRecordId: string) {
  return renderHookWithProviders(() => ({
    uploads: useMealRecordUploads(mealRecordId),
    uploading: useShopUploading(shopId),
  })).result;
}

function queue(
  mealRecordId: string,
  files: File[],
  upload: UploadImage,
  callbacks: {
    revalidateMealRecords?: () => void;
    onDrained?: () => void;
  } = {},
) {
  act(() =>
    queueMealRecordUploads({
      shopId: "shop",
      mealRecordId,
      files,
      slots: 10,
      upload,
      revalidateMealRecords: callbacks.revalidateMealRecords ?? vi.fn(),
      onDrained: callbacks.onDrained ?? vi.fn(),
    }),
  );
}

describe("uploadTimeoutMs", () => {
  it("allows 30 s plus 50 KB/s of the file", () => {
    expect(uploadTimeoutMs(0)).toBe(30_000);
    expect(uploadTimeoutMs(15 * 1024 * 1024)).toBe(30_000 + 307_200);
  });
});

describe("queueMealRecordUploads", () => {
  it("keeps upload and deletion locks on the shared record across both linked shops", async () => {
    const a = watch("A", "shared");
    const b = watch("B", "shared");
    const deletionLocks = renderHookWithProviders(() =>
      useUploadingMealRecordIds(),
    ).result;
    let finish = () => {};
    const upload: UploadImage = () =>
      new Promise((resolve) => {
        finish = () => resolve(ok(stored));
      });
    act(() =>
      queueMealRecordUploads({
        shopId: "A",
        shopIds: ["A", "B"],
        mealRecordId: "shared",
        files: [jpeg("a.jpg")],
        slots: 10,
        upload,
        revalidateMealRecords: () => {},
        onDrained: () => {},
      }),
    );
    await waitFor(() => expect(a.current.uploads[0]?.status).toBe("uploading"));
    expect(a.current.uploading).toBe(true);
    expect(b.current.uploading).toBe(true);
    expect(b.current.uploads).toEqual(a.current.uploads);
    expect(deletionLocks.current.has("shared")).toBe(true);
    act(() => finish());
    await waitFor(() => expect(b.current.uploads).toEqual([]));
    expect(a.current.uploading).toBe(false);
    expect(b.current.uploading).toBe(false);
    expect(deletionLocks.current.has("shared")).toBe(false);
  });
  it("reports an aborted upload as unconfirmed and refetches the meal records", async () => {
    const result = watch("shop", "mealRecord-abort");
    const revalidateMealRecords = vi.fn();
    const onDrained = vi.fn();
    const upload = vi.fn<UploadImage>(async (_, image, { timeoutMs }) => {
      expect(timeoutMs).toBe(uploadTimeoutMs(image.blob.size));
      return err(toNetworkApiError("/upload", new Error("aborted")));
    });

    queue("mealRecord-abort", [jpeg("slow.jpg")], upload, {
      revalidateMealRecords,
      onDrained,
    });
    expect(result.current.uploading).toBe(true);

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([
        {
          name: "slow.jpg",
          status: "failed",
          message:
            "アップロードの完了を確認できませんでした。一覧を確認してください",
        },
      ]),
    );
    expect(result.current.uploading).toBe(false);
    expect(revalidateMealRecords).toHaveBeenCalledTimes(1);
    // The image may have been saved, so the 代表写真 is refetched too.
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("calls onDrained once after the meal record's last upload", async () => {
    const result = watch("shop", "mealRecord-drain");
    const upload = vi.fn<UploadImage>(async () => ok(stored));
    const onDrained = vi.fn();

    queue("mealRecord-drain", [jpeg("a.jpg"), jpeg("b.jpg")], upload, {
      onDrained,
    });

    await waitFor(() => expect(result.current.uploads).toEqual([]));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("cancels only files that have not started", async () => {
    const result = watch("shop", "mealRecord-cancel");
    let finish = () => {};
    const upload = vi.fn<UploadImage>(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(ok(stored));
        }),
    );

    queue("mealRecord-cancel", [jpeg("a.jpg"), jpeg("b.jpg")], upload);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const [started, queued] = result.current.uploads;
    expect(started.status).toBe("uploading");
    expect(queued.status).toBe("waiting");
    act(() => {
      cancelUpload(started.key);
      cancelUpload(queued.key);
    });
    expect(result.current.uploads.map((p) => p.name)).toEqual(["a.jpg"]);

    act(() => finish());
    await waitFor(() => expect(result.current.uploads).toEqual([]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("drops queued files on reset and aborts the running upload", async () => {
    const result = watch("shop", "mealRecord-reset");
    let aborted = false;
    const upload = vi.fn<UploadImage>(
      (_, __, { signal }) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve(err(toNetworkApiError("/upload", signal.reason)));
          }),
        ),
    );

    queue("mealRecord-reset", [jpeg("a.jpg"), jpeg("b.jpg")], upload);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    act(() => resetMealRecordUploads());

    expect(result.current.uploads).toEqual([]);
    await waitFor(() => expect(aborted).toBe(true));
    // b.jpg never starts.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.current.uploads).toEqual([]);
  });

  it("purges failures of meal records that no longer exist", async () => {
    const gone = watch("shop", "mealRecord-gone");
    const kept = watch("shop", "mealRecord-kept");
    const failing: UploadImage = async () =>
      err(
        toApiError("/upload", new Response(null, { status: 404 }), {
          type: "not_found",
        } as const),
      );

    queue("mealRecord-gone", [jpeg("a.jpg")], failing);
    queue("mealRecord-kept", [jpeg("b.jpg")], failing);
    await waitFor(() => {
      expect(gone.current.uploads[0]?.status).toBe("failed");
      expect(kept.current.uploads[0]?.status).toBe("failed");
    });
    act(() => purgeFailedUploads("shop", ["mealRecord-kept"]));

    expect(gone.current.uploads).toEqual([]);
    expect(kept.current.uploads).toHaveLength(1);
  });
});
