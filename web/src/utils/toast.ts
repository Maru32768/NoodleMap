import { toaster } from "@/components/ui/toaster.tsx";
import type { UploadMealRecordImageErrorBody } from "@/features/meal-records/api/use-meal-record-images.ts";
import {
  type FieldErrorType,
  SHOP_NAME_KANA_MAX_LENGTH,
  type UpdateShopField,
} from "@/features/shops/shop-field-errors.ts";
import {
  SHOP_LINK_LABEL_MAX_LENGTH,
  SHOP_LINK_URL_MAX_LENGTH,
  SHOP_LINKS_MAX,
  type ShopLinkProblem,
} from "@/features/shops/shop-links.ts";
import type { components } from "@/generated/api.ts";
import { ApiError, invalidRequestFieldErrors } from "@/utils/request.ts";

type ErrorType = components["schemas"]["ErrorType"];
type MealRecordField = components["schemas"]["MealRecordField"];

export function toastError(options: Parameters<typeof toaster.error>[0]) {
  toaster.error(options);
}

type ApiErrorToastOptions = {
  fallbackTitle?: string;
  fallbackDescription?: string;
  // A repeated toast with the same id replaces the visible one.
  id?: string;
};

type UserErrorMessage = {
  title: string;
  description?: string;
};

const apiErrorMessages: Readonly<Record<ErrorType, UserErrorMessage>> = {
  request_body_too_large: {
    title: "送信するデータが大きすぎます",
    description: "入力内容を減らしてもう一度お試しください。",
  },
  request_body_busy: {
    title: "サーバーが混み合っています",
    description: "時間をおいてもう一度お試しください。",
  },
  request_body_timeout: {
    title: "データの送信がタイムアウトしました",
    description: "接続を確認してもう一度お試しください。",
  },
  backup_busy: {
    title: "バックアップを実行中です",
    description: "完了するまで待ってからもう一度お試しください。",
  },
  invalid_request: {
    title: "入力内容を確認してください",
  },
  authentication_required: {
    title: "ログインが必要です",
    description: "もう一度ログインしてから操作してください。",
  },
  permission_denied: {
    title: "この操作を行う権限がありません",
  },
  google_auth_failed: {
    title: "Googleログインに失敗しました",
    description: "時間をおいてもう一度お試しください。",
  },
  session_creation_failed: {
    title: "ログイン状態を保存できませんでした",
    description: "時間をおいてもう一度お試しください。",
  },
  not_found: {
    title: "対象のデータが見つかりません",
  },
  internal_error: {
    title: "サーバーで問題が発生しました",
    description: "時間をおいてもう一度お試しください。",
  },
  google_places_not_configured: {
    title: "Google Place 検索を利用できません",
    description: "店舗情報はフォームに直接入力してください。",
  },
  google_places_failed: {
    title: "Google Place 検索に失敗しました",
    description:
      "時間をおいてもう一度お試しください。店舗情報はフォームに直接入力することもできます。",
  },
  shop_has_meal_records: {
    title: "店舗を削除できませんでした",
    description: "食べた記録がある店舗は削除できません",
  },
  meal_record_image_limit_reached: {
    title: "画像を追加できませんでした",
    description: "1つの食べた記録に追加できる画像は10枚までです",
  },
  meal_record_image_processing_busy: {
    title: "画像を処理できませんでした",
    description: "時間をおいてもう一度お試しください。",
  },
  meal_record_images_storage_unconfigured: {
    title: "画像の保存先が設定されていません",
  },
};

const statusMessages: Readonly<Record<number, UserErrorMessage>> = {
  400: {
    title: "入力内容を確認してください",
  },
  401: {
    title: "ログインが必要です",
    description: "もう一度ログインしてから操作してください。",
  },
  403: {
    title: "この操作を行う権限がありません",
  },
  404: {
    title: "対象のデータが見つかりません",
  },
  500: {
    title: "サーバーで問題が発生しました",
    description: "時間をおいてもう一度お試しください。",
  },
  502: {
    title: "サーバーに接続できませんでした",
    description: "時間をおいてもう一度お試しください。",
  },
  503: {
    title: "サービスを一時的に利用できません",
    description: "時間をおいてもう一度お試しください。",
  },
};

// AppErrorBoundary's fallback page, shown when rendering throws.
export const APP_ERROR_TITLE = "エラーが発生しました";
export const APP_ERROR_DESCRIPTION = "ページを再読み込みしてください。";
export const APP_ERROR_RELOAD_LABEL = "再読み込み";

const SHOP_DUPLICATE_PLACE_ID_TITLE =
  "Google Place ID が他の店舗と重複しています";
export const SHOP_ADD_FAILED_TITLE = "店舗を追加できませんでした";
export const SHOP_UPDATE_FAILED_TITLE = "店舗を更新できませんでした";
export const SHOP_ALREADY_DELETED_TITLE = "この店舗はすでに削除されています";

// 店舗リンク problems: rejected by the server, or caught before saving.
const SHOP_LINKS_INVALID_TITLE = `リンクの内容を確認してください（http(s) の URL は${SHOP_LINK_URL_MAX_LENGTH}文字まで、表示名は${SHOP_LINK_LABEL_MAX_LENGTH}文字まで、最大${SHOP_LINKS_MAX}件）`;

// Message for an `invalid_request` field error on a shop form: shown under the
// named input, or in a toast when the form has no input for that field.
export function shopFieldErrorMessage(
  field: UpdateShopField,
  type: FieldErrorType,
): string {
  if (field === "links") {
    return SHOP_LINKS_INVALID_TITLE;
  }
  if (field === "tagIds") {
    return "存在しないタグが含まれています。タグを選び直してください";
  }
  switch (type) {
    case "required":
      return "入力してください";
    case "invalid_format":
      return "形式が正しくありません";
    case "out_of_range":
      return "範囲外の値です";
    case "too_long":
      return field === "nameKana"
        ? `${SHOP_NAME_KANA_MAX_LENGTH}文字以内で入力してください`
        : "長すぎます";
    case "duplicate":
      return field === "googlePlaceId"
        ? SHOP_DUPLICATE_PLACE_ID_TITLE
        : "他の店舗と重複しています";
    case "unknown":
      return "入力内容を確認してください";
  }
  // A field or error type added on the server after this client was built.
  return "入力内容を確認してください";
}

// For field errors the form has no input to show them on: one toast per distinct message.
export function toastShopFieldErrors(
  title: string,
  errors: readonly { field: UpdateShopField; type: FieldErrorType }[],
) {
  const messages = new Set(
    errors.map((error) => shopFieldErrorMessage(error.field, error.type)),
  );
  for (const description of messages) {
    toastError({ title, description });
  }
}

export const MEAL_RECORD_SAVE_FAILED_TITLE = "食べた記録を保存できませんでした";
export const MEAL_RECORD_DELETE_FAILED_TITLE =
  "食べた記録を削除できませんでした";
export const MEAL_RECORD_ALREADY_DELETED_TITLE =
  "この食べた記録はすでに削除されています";
export const MEAL_RECORD_INPUT_INVALID_DESCRIPTION =
  "入力内容を確認してください";
export const MEAL_RECORDS_LOAD_FAILED_MESSAGE =
  "食べた記録を読み込めませんでした";
export const MEAL_RECORDS_REFRESH_FAILED_MESSAGE =
  "食べた記録を更新できませんでした。表示は前回の内容です";

// Mirrors @maxLength on MealRecordInput in typespec/main.tsp.
const MEAL_RECORD_TEXT_MAX_LENGTH: Partial<Record<MealRecordField, number>> = {
  venueName: 100,
  publicNote: 2000,
  privateNote: 2000,
};

const MEAL_RECORD_FORMAT_MESSAGE: Partial<Record<MealRecordField, string>> = {
  eatenOn: "日付の形式が正しくありません",
  rate: "数値で入力してください",
};

const MEAL_RECORD_RANGE_MESSAGE: Partial<Record<MealRecordField, string>> = {
  eatenOn: "明日以前の日付を入力してください",
  rate: "0〜100の範囲で入力してください",
};

// Message for an `invalid_request` field error on the 食べた記録 form.
export function mealRecordFieldErrorMessage(
  field: MealRecordField,
  type: FieldErrorType,
): string {
  switch (type) {
    case "required":
      return "入力してください";
    case "invalid_format":
      return MEAL_RECORD_FORMAT_MESSAGE[field] ?? "形式が正しくありません";
    case "out_of_range":
      return MEAL_RECORD_RANGE_MESSAGE[field] ?? "範囲外の値です";
    case "too_long": {
      const max = MEAL_RECORD_TEXT_MAX_LENGTH[field];
      return max ? `${max}文字以内で入力してください` : "長すぎます";
    }
    case "duplicate":
    case "unknown":
      return "入力内容を確認してください";
  }
  // A field or error type added on the server after this client was built.
  return "入力内容を確認してください";
}

// Mirror @maxItems on MealRecordInput.menuItems and the limits on MenuItemInput in typespec/main.tsp.
export const MENU_ITEMS_MAX = 10;
export const MENU_ITEM_NAME_MAX_LENGTH = 200;
export const MENU_ITEM_PRICE_MAX = 10_000_000;

const MENU_ITEM_MESSAGES: Record<
  "name" | "price",
  Partial<Record<FieldErrorType, string>>
> = {
  name: {
    required: "メニュー名を入力してください",
    invalid_format: "メニュー名に使えない文字が含まれています",
    too_long: `メニュー名は${MENU_ITEM_NAME_MAX_LENGTH}文字以内で入力してください`,
  },
  price: {
    invalid_format: "価格は整数で入力してください",
    out_of_range: `価格は0〜${MENU_ITEM_PRICE_MAX.toLocaleString("ja-JP")}の範囲で入力してください`,
  },
};

// Message for an error on a 食べたメニュー's name or price.
export function menuItemFieldErrorMessage(
  part: "name" | "price",
  type: FieldErrorType,
): string {
  return MENU_ITEM_MESSAGES[part][type] ?? "入力内容を確認してください";
}

const MENU_ITEM_ERROR = /^menuItems\[(\d+)\]\.(name|price)$/;

/**
 * Message for a server error on `menuItems`. An error on one item names it in
 * `message` (`menuItems[0].name`) and is shown as 「メニュー 1 の…」; one
 * without an item is on the list itself, such as too many items.
 */
export function menuItemsServerErrorMessage(error: {
  type: FieldErrorType;
  message?: string;
}): string {
  const item = error.message?.match(MENU_ITEM_ERROR);
  if (item) {
    const part = item[2] as "name" | "price";
    return `メニュー ${Number(item[1]) + 1} の${menuItemFieldErrorMessage(part, error.type)}`;
  }
  return error.type === "out_of_range"
    ? `メニューは${MENU_ITEMS_MAX}品まで記録できます`
    : "メニューを確認してください";
}

// Mirrors @maxLength on UpdateMealRecordImageRequest.caption in typespec/main.tsp.
export const MEAL_RECORD_IMAGE_CAPTION_MAX_LENGTH = 100;
// Mirrors the server's per-meal record image limit.
export const MEAL_RECORD_IMAGES_MAX = 10;

export const MEAL_RECORD_IMAGE_UNDECODABLE_MESSAGE =
  "この画像形式は読み込めません";
// The upload was aborted (timeout) or cut off: it may still have been saved.
export const MEAL_RECORD_IMAGE_UPLOAD_UNCONFIRMED_MESSAGE =
  "アップロードの完了を確認できませんでした。一覧を確認してください";
export const MEAL_RECORD_IMAGE_NOT_IMAGE_MESSAGE =
  "画像ファイルのみ追加できます";
export const MEAL_RECORD_IMAGE_LIMIT_MESSAGE = `1つの食べた記録に追加できる画像は${MEAL_RECORD_IMAGES_MAX}枚までです`;
export const MEAL_RECORD_IMAGE_CAPTION_FAILED_TITLE =
  "キャプションを保存できませんでした";
export const MEAL_RECORD_IMAGE_REORDER_FAILED_TITLE =
  "画像の並び順を保存できませんでした";
export const MEAL_RECORD_IMAGE_DELETE_FAILED_TITLE =
  "画像を削除できませんでした";
export const MEAL_RECORD_IMAGE_ALREADY_DELETED_TITLE =
  "この画像はすでに削除されています";

const MEAL_RECORD_IMAGE_FILE_MESSAGE: Partial<Record<FieldErrorType, string>> =
  {
    too_long: "15MB以下の画像を選んでください",
    invalid_format: "JPEG・PNGとして読み込めない画像です",
    out_of_range: "画像の画素数が大きすぎます",
  };

const MEAL_RECORD_IMAGE_UPLOAD_MESSAGE: Partial<Record<ErrorType, string>> = {
  meal_record_image_limit_reached: MEAL_RECORD_IMAGE_LIMIT_MESSAGE,
  meal_record_image_processing_busy:
    "サーバーが混み合っています。時間をおいてもう一度お試しください",
  meal_record_images_storage_unconfigured:
    "画像の保存先が設定されていないため追加できません",
  not_found: "食べた記録が見つかりません。削除された可能性があります",
};

/** Why one file could not be added to a 食べた記録, shown next to that file. */
export function mealRecordImageUploadErrorMessage(
  err: ApiError<UploadMealRecordImageErrorBody | undefined>,
): string {
  const fileError = invalidRequestFieldErrors(err.body)?.find(
    (e) => e.field === "file",
  );
  const fileMessage =
    fileError && MEAL_RECORD_IMAGE_FILE_MESSAGE[fileError.type];
  if (fileMessage) {
    return fileMessage;
  }
  const typeMessage = err.type && MEAL_RECORD_IMAGE_UPLOAD_MESSAGE[err.type];
  return typeMessage || apiErrorText(err);
}

/** The toast's title and description of `err` as one line, for a list of failures. */
export function apiErrorText(err: ApiError): string {
  const message = getApiErrorMessage(err);
  return message.description
    ? `${message.title}。${message.description}`
    : message.title;
}

/** Message under the caption input for an `invalid_request` on it. */
export function mealRecordImageCaptionErrorMessage(
  type: FieldErrorType,
): string {
  return type === "too_long"
    ? `${MEAL_RECORD_IMAGE_CAPTION_MAX_LENGTH}文字以内で入力してください`
    : "入力内容を確認してください";
}

export function shopLinkProblemMessage(
  problem: ShopLinkProblem,
): UserErrorMessage {
  switch (problem.kind) {
    case "missing_url":
      return {
        title: `リンク ${problem.row} の URL が未入力です`,
        description: "URL を入力するか、そのリンクを削除してください。",
      };
    case "invalid_url":
      return {
        title: `リンク ${problem.row} の URL が正しくありません`,
        description:
          "http:// または https:// で始まる URL を入力してください。",
      };
    case "url_too_long":
      return {
        title: `リンク ${problem.row} の URL が長すぎます`,
        description: `URL は${SHOP_LINK_URL_MAX_LENGTH}文字までです。`,
      };
    case "label_too_long":
      return {
        title: `リンク ${problem.row} の表示名が長すぎます`,
        description: `表示名は${SHOP_LINK_LABEL_MAX_LENGTH}文字までです。`,
      };
    case "too_many":
      return {
        title: "リンクが多すぎます",
        description: `リンクは${SHOP_LINKS_MAX}件までです。`,
      };
  }
}

export function toastApiError(err: ApiError, options?: ApiErrorToastOptions) {
  const message = getApiErrorMessage(err, options);
  toastError({
    // An explicit `id: undefined` would stop the toaster generating one.
    ...(options?.id ? { id: options.id } : {}),
    title: message.title,
    description: message.description,
  });
}

function getApiErrorMessage(
  err: ApiError,
  options?: ApiErrorToastOptions,
): UserErrorMessage {
  const message = (err.type ? apiErrorMessages[err.type] : undefined) ??
    statusMessages[err.status] ?? {
      title: "予期しないエラーが発生しました",
      description: "時間をおいてもう一度お試しください。",
    };

  return {
    title: options?.fallbackTitle ?? message.title,
    description: options?.fallbackDescription ?? message.description,
  };
}
