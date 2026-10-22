import type { components } from "@/generated/api.ts";

export type AddShopField = components["schemas"]["AddShopField"];
export type UpdateShopField = components["schemas"]["UpdateShopField"];
export type FieldErrorType = components["schemas"]["FieldErrorType"];

// Mirrors the server's NAME_KANA_MAX_LENGTH (and @maxLength in typespec/main.tsp).
export const SHOP_NAME_KANA_MAX_LENGTH = 100;

/** The error shown on each shop form input, keyed by its API field name. */
export type ShopFieldErrors<F extends UpdateShopField> = Partial<
  Record<F, FieldErrorType>
>;

/** Keeps the first error per field. */
export function toShopFieldErrors<F extends UpdateShopField>(
  fieldErrors: readonly { field: F; type: FieldErrorType }[],
): ShopFieldErrors<F> {
  const errors: ShopFieldErrors<F> = {};
  for (const { field, type } of fieldErrors) {
    errors[field] ??= type;
  }
  return errors;
}

/** Drops the errors of edited fields; returns the same object when none of them had one. */
export function clearShopFieldErrors<F extends UpdateShopField>(
  errors: ShopFieldErrors<F>,
  fields: readonly F[],
): ShopFieldErrors<F> {
  if (!fields.some((field) => field in errors)) {
    return errors;
  }
  const next = { ...errors };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}
