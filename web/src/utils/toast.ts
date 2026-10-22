import { toaster } from "@/components/ui/toaster.tsx";
import type { components } from "@/generated/api.ts";
import { ApiError } from "@/utils/request.ts";

type ErrorType = components["schemas"]["ErrorType"];

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

// 店舗リンク problems reported by the shop edit flow.
export const SHOP_LINKS_INVALID_TITLE =
  "リンクの内容を確認してください（http(s) の URL、表示名は100文字まで、最大10件）";
export const SHOP_LINK_URL_MISSING: UserErrorMessage = {
  title: "URL が未入力のリンクがあります",
  description: "URL を入力するか、そのリンクを削除してください。",
};

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
