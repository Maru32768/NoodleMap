import { useEffect } from "react";

export const SITE_TITLE = "Maru's Noodle Map";

/** Sets the tab title to `<page> | <site>`, or the site name alone without a page. */
export function useDocumentTitle(page?: string, site = SITE_TITLE) {
  useEffect(() => {
    document.title = page ? `${page} | ${site}` : site;
  }, [page, site]);
}
