export const SEARCH_PATH = "/search";
export const ADMIN_PATH = "/admin";
export const LOGIN_PATH = "/login";
export const ACCOUNT_PATH = "/account";
export const MEAL_RECORDS_PATH = "/meal-records";

/** Search-page query param that holds the selected shop's id. */
export const SHOP_PARAM = "shop";

/**
 * The single source for a shop's shareable URL: the backend's share page, which
 * carries OGP tags and redirects to `/search?shop=<id>`.
 */
export function shopShareUrl(id: string) {
  return `${location.origin}/r/${encodeURIComponent(id)}`;
}
