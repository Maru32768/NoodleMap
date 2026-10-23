import type { VisitImage } from "@/features/visits/api/use-visit-images.ts";
import {
  cancelUpload,
  purgeFailedUploads,
  queueVisitUploads,
  resetVisitUploads,
  UploadImage,
  uploadTimeoutMs,
  useShopUploading,
  useVisitUploads,
} from "@/features/visits/api/visit-uploads.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { toApiError, toNetworkApiError } from "@/utils/request.ts";
import { err, ok } from "@/utils/result.ts";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  resetVisitUploads();
});

const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

const stored: VisitImage = {
  id: "00000000-0000-4000-8000-0000000003a1",
  url: "https://img.example.test/a.jpg",
  width: 320,
  height: 240,
};

function watch(shopId: string, visitId: string) {
  return renderHookWithProviders(() => ({
    uploads: useVisitUploads(visitId),
    uploading: useShopUploading(shopId),
  })).result;
}

function queue(
  visitId: string,
  files: File[],
  upload: UploadImage,
  callbacks: { revalidateVisits?: () => void; onDrained?: () => void } = {},
) {
  act(() =>
    queueVisitUploads({
      shopId: "shop",
      visitId,
      files,
      slots: 10,
      upload,
      revalidateVisits: callbacks.revalidateVisits ?? vi.fn(),
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

describe("queueVisitUploads", () => {
  it("reports an aborted upload as unconfirmed and refetches the visits", async () => {
    const result = watch("shop", "visit-abort");
    const revalidateVisits = vi.fn();
    const onDrained = vi.fn();
    const upload = vi.fn<UploadImage>(async (_, image, { timeoutMs }) => {
      expect(timeoutMs).toBe(uploadTimeoutMs(image.blob.size));
      return err(toNetworkApiError("/upload", new Error("aborted")));
    });

    queue("visit-abort", [jpeg("slow.jpg")], upload, {
      revalidateVisits,
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
    expect(revalidateVisits).toHaveBeenCalledTimes(1);
    // The image may have been saved, so the 代表写真 is refetched too.
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("calls onDrained once after the visit's last upload", async () => {
    const result = watch("shop", "visit-drain");
    const upload = vi.fn<UploadImage>(async () => ok(stored));
    const onDrained = vi.fn();

    queue("visit-drain", [jpeg("a.jpg"), jpeg("b.jpg")], upload, {
      onDrained,
    });

    await waitFor(() => expect(result.current.uploads).toEqual([]));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("cancels only files that have not started", async () => {
    const result = watch("shop", "visit-cancel");
    let finish = () => {};
    const upload = vi.fn<UploadImage>(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(ok(stored));
        }),
    );

    queue("visit-cancel", [jpeg("a.jpg"), jpeg("b.jpg")], upload);
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
    const result = watch("shop", "visit-reset");
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

    queue("visit-reset", [jpeg("a.jpg"), jpeg("b.jpg")], upload);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    act(() => resetVisitUploads());

    expect(result.current.uploads).toEqual([]);
    await waitFor(() => expect(aborted).toBe(true));
    // b.jpg never starts.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.current.uploads).toEqual([]);
  });

  it("purges failures of visits that no longer exist", async () => {
    const gone = watch("shop", "visit-gone");
    const kept = watch("shop", "visit-kept");
    const failing: UploadImage = async () =>
      err(
        toApiError("/upload", new Response(null, { status: 404 }), {
          type: "not_found",
        } as const),
      );

    queue("visit-gone", [jpeg("a.jpg")], failing);
    queue("visit-kept", [jpeg("b.jpg")], failing);
    await waitFor(() => {
      expect(gone.current.uploads[0]?.status).toBe("failed");
      expect(kept.current.uploads[0]?.status).toBe("failed");
    });
    act(() => purgeFailedUploads("shop", ["visit-kept"]));

    expect(gone.current.uploads).toEqual([]);
    expect(kept.current.uploads).toHaveLength(1);
  });
});
