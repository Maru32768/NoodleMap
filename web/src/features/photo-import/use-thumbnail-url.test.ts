import { useThumbnail } from "@/features/photo-import/use-thumbnail-url.ts";
import { ExifSpec, withExif } from "@/test/exif-jpeg.ts";
import { renderHookWithProviders } from "@/test/render.tsx";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const BARE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const photo = (spec: ExifSpec) =>
  new File([withExif(BARE_JPEG, spec)], "IMG_0001.JPG", {
    type: "image/jpeg",
  });

async function thumbnailOf(file: File) {
  const { result } = renderHookWithProviders(() => useThumbnail(file));
  await waitFor(() => expect(result.current).toBeDefined());
  return result.current!;
}

describe("useThumbnail", () => {
  // jsdom has no object URLs.
  beforeEach(() => {
    URL.createObjectURL = () => "blob:thumbnail";
    URL.revokeObjectURL = () => {};
  });
  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("turns the embedded thumbnail of a photo taken upright", async () => {
    const thumbnail = await thumbnailOf(
      photo({ orientation: 6, thumbnail: BARE_JPEG }),
    );

    expect(thumbnail.transform).toBe("rotate(90deg) scale(1, 1)");
  });

  it("leaves a landscape photo's thumbnail as it is", async () => {
    const thumbnail = await thumbnailOf(
      photo({ orientation: 1, thumbnail: BARE_JPEG }),
    );

    expect(thumbnail.transform).toBeUndefined();
  });

  it("leaves the file itself to the browser when there is no thumbnail", async () => {
    const thumbnail = await thumbnailOf(photo({ orientation: 6 }));

    expect(thumbnail.transform).toBeUndefined();
  });
});
