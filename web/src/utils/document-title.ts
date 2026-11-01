import { useEffect } from "react";

export const SITE_TITLE = "Maru's Noodle Map";

/**
 * Sets the tab title to `<page> | <site>`, or the site name alone without a page.
 * A page kept mounted while hidden passes `enabled: false` to leave the title alone.
 */
export function useDocumentTitle(
  page?: string,
  site = SITE_TITLE,
  enabled = true,
) {
  useEffect(() => {
    if (enabled) {
      document.title = page ? `${page} | ${site}` : site;
    }
  }, [page, site, enabled]);
}
