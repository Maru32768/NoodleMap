import { useEffect, useState } from "react";

export interface Thumbnail {
  readonly url: string;
  /** CSS transform that turns the image upright; undefined when it already is. */
  readonly transform?: string;
}

/**
 * An object URL of the photo's embedded EXIF thumbnail (about 160 px), or of
 * the file itself when it has none. Created on mount and revoked on unmount,
 * so only the rows on screen hold one.
 */
export function useThumbnail(file: File): Thumbnail | undefined {
  const [thumbnail, setThumbnail] = useState<Thumbnail>();
  useEffect(() => {
    let created: string | undefined;
    let unmounted = false;
    void (async () => {
      const { default: exifr, rotations } = await import("exifr");
      const embedded = await exifr.thumbnailUrl(file).catch(() => undefined);
      // The embedded thumbnail is stored as the sensor saw it and carries no
      // orientation, so a portrait photo's lies on its side unless turned here.
      // The file itself is turned by the browser.
      const orientation = embedded
        ? await exifr.orientation(file).catch(() => undefined)
        : undefined;
      const rotation = orientation ? rotations[orientation] : undefined;
      if (unmounted) {
        if (embedded) {
          URL.revokeObjectURL(embedded);
        }
        return;
      }
      created = embedded ?? URL.createObjectURL(file);
      setThumbnail({
        url: created,
        transform:
          rotation &&
          (rotation.deg || rotation.scaleX < 0 || rotation.scaleY < 0)
            ? `rotate(${rotation.deg}deg) scale(${rotation.scaleX}, ${rotation.scaleY})`
            : undefined,
      });
    })();
    return () => {
      unmounted = true;
      if (created) {
        URL.revokeObjectURL(created);
      }
    };
  }, [file]);
  return thumbnail;
}
