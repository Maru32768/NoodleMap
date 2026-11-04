import { useEffect } from "react";

/**
 * A file dropped outside an area that takes it would make the browser open it
 * and leave the page, and an unsaved draft with it.
 */
export function useRefuseFileDrop(active = true) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const refuseFileDrop = (event: DragEvent) => {
      if (
        !event.defaultPrevented &&
        event.dataTransfer?.types.includes("Files")
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
      }
    };
    window.addEventListener("dragover", refuseFileDrop);
    window.addEventListener("drop", refuseFileDrop);
    return () => {
      window.removeEventListener("dragover", refuseFileDrop);
      window.removeEventListener("drop", refuseFileDrop);
    };
  }, [active]);
}
