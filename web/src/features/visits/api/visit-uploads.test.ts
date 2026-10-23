import type { VisitImage } from "@/features/visits/api/use-visit-images.ts";
import {
  queueVisitUploads,
  UploadImage,
  useShopUploading,
  useVisitUploads,
} from "@/features/visits/api/visit-uploads.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { toNetworkApiError } from "@/utils/request.ts";
import { err, ok } from "@/utils/result.ts";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

describe("queueVisitUploads", () => {
  it("fails a stalled upload after the timeout and frees the queue", async () => {
    const result = watch("shop-timeout", "visit-timeout");
    // Never answers until aborted, like a stalled connection.
    const stalled: UploadImage = (_, __, signal) =>
      new Promise((resolve) =>
        signal.addEventListener("abort", () =>
          resolve(err(toNetworkApiError("/upload", signal.reason))),
        ),
      );
    const onDrained = vi.fn();

    act(() =>
      queueVisitUploads({
        shopId: "shop-timeout",
        visitId: "visit-timeout",
        files: [jpeg("slow.jpg")],
        slots: 10,
        upload: stalled,
        onDrained,
        timeoutMs: 20,
      }),
    );
    expect(result.current.uploading).toBe(true);

    await waitFor(() =>
      expect(result.current.uploads).toMatchObject([
        {
          name: "slow.jpg",
          status: "failed",
          message:
            "アップロードに時間がかかりすぎたため中止しました。もう一度お試しください",
        },
      ]),
    );
    expect(result.current.uploading).toBe(false);
    expect(onDrained).not.toHaveBeenCalled();
  });

  it("calls onDrained once after the visit's last upload", async () => {
    const result = watch("shop-drain", "visit-drain");
    const upload = vi.fn<UploadImage>(async () => ok(stored));
    const onDrained = vi.fn();

    queueVisitUploads({
      shopId: "shop-drain",
      visitId: "visit-drain",
      files: [jpeg("a.jpg"), jpeg("b.jpg")],
      slots: 10,
      upload,
      onDrained,
    });

    await waitFor(() => expect(result.current.uploads).toEqual([]));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onDrained).toHaveBeenCalledTimes(1);
  });
});
