import { toaster } from "@/components/ui/toaster.tsx";
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
import { ApiError } from "@/utils/request.ts";

type ErrorType = components["schemas"]["ErrorType"];
type VisitLogField = components["schemas"]["VisitLogField"];

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
  shop_has_visit_logs: {
    title: "店舗を削除できませんでした",
    description: "訪問ログがある店舗は削除できません",
  },
  visit_image_limit_reached: {
    title: "画像を追加できませんでした",
    description: "1つの訪問ログに追加できる画像は10枚までです",
  },
  visit_image_processing_busy: {
    title: "画像を処理できませんでした",
    description: "時間をおいてもう一度お試しください。",
  },
  visit_images_storage_unconfigured: {
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

export const VISIT_SAVE_FAILED_TITLE = "訪問ログを保存できませんでした";
export const VISIT_DELETE_FAILED_TITLE = "訪問ログを削除できませんでした";
export const VISIT_ALREADY_DELETED_TITLE =
  "この訪問ログはすでに削除されています";
export const VISIT_INPUT_INVALID_DESCRIPTION = "入力内容を確認してください";
export const VISITS_LOAD_FAILED_MESSAGE = "訪問ログを読み込めませんでした";
export const VISITS_REFRESH_FAILED_MESSAGE =
  "訪問ログを更新できませんでした。表示は前回の内容です";

// Mirrors @maxLength on VisitLogInput in typespec/main.tsp.
const VISIT_TEXT_MAX_LENGTH: Partial<Record<VisitLogField, number>> = {
  menuName: 200,
  eventName: 100,
  publicNote: 2000,
  privateNote: 2000,
};

const VISIT_FORMAT_MESSAGE: Partial<Record<VisitLogField, string>> = {
  visitedOn: "日付の形式が正しくありません",
  price: "整数で入力してください",
  rate: "数値で入力してください",
};

const VISIT_RANGE_MESSAGE: Partial<Record<VisitLogField, string>> = {
  visitedOn: "明日以前の日付を入力してください",
  price: "0〜10,000,000の範囲で入力してください",
  rate: "0〜100の範囲で入力してください",
};

// Message for an `invalid_request` field error on the 訪問ログ form.
export function visitFieldErrorMessage(
  field: VisitLogField,
  type: FieldErrorType,
): string {
  switch (type) {
    case "required":
      return "入力してください";
    case "invalid_format":
      return VISIT_FORMAT_MESSAGE[field] ?? "形式が正しくありません";
    case "out_of_range":
      return VISIT_RANGE_MESSAGE[field] ?? "範囲外の値です";
    case "too_long": {
      const max = VISIT_TEXT_MAX_LENGTH[field];
      return max ? `${max}文字以内で入力してください` : "長すぎます";
    }
    case "duplicate":
    case "unknown":
      return "入力内容を確認してください";
  }
  // A field or error type added on the server after this client was built.
  return "入力内容を確認してください";
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
