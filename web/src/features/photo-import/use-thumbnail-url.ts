import { useEffect, useState } from "react";

/**
 * An object URL of the photo's embedded EXIF thumbnail (about 160 px), or of
 * the file itself when it has none. Created on mount and revoked on unmount,
 * so only the rows on screen hold one.
 */
export function useThumbnailUrl(file: File): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let created: string | undefined;
    let unmounted = false;
    void (async () => {
      const { default: exifr } = await import("exifr");
      const thumbnail = await exifr.thumbnailUrl(file).catch(() => undefined);
      created = thumbnail ?? URL.createObjectURL(file);
      if (unmounted) {
        URL.revokeObjectURL(created);
        return;
      }
      setUrl(created);
    })();
    return () => {
      unmounted = true;
      if (created) {
        URL.revokeObjectURL(created);
      }
    };
  }, [file]);
  return url;
}
