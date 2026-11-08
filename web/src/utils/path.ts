export const SEARCH_PATH = "/search";
export const ADMIN_PATH = "/admin";
export const LOGIN_PATH = "/login";
export const ACCOUNT_PATH = "/account";
export const MEAL_RECORDS_PATH = "/meal-records";

/** Search-page query param that holds the selected shop's id. */
export const SHOP_PARAM = "shop";

/**
 * The single source for a shop's shareable URL: the search page with the shop
 * open. The edge Worker (`edge/og-worker.js`) gives it the shop's OGP tags.
 */
export function shopShareUrl(id: string) {
  return `${location.origin}${SEARCH_PATH}?${SHOP_PARAM}=${encodeURIComponent(id)}`;
}
