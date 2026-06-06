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
  internal_error: {
    title: "サーバーで問題が発生しました",
    description: "時間をおいてもう一度お試しください。",
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

export function toastApiError(err: ApiError, options?: ApiErrorToastOptions) {
  const message = getApiErrorMessage(err, options);
  toastError({
    title: message.title,
    description: message.description,
  });
}

function getApiErrorMessage(
  err: ApiError,
  options?: ApiErrorToastOptions,
): UserErrorMessage {
  const message =
    (err.type ? apiErrorMessages[err.type] : undefined) ??
    statusMessages[err.status] ?? {
      title: "予期しないエラーが発生しました",
      description: "時間をおいてもう一度お試しください。",
    };

  return {
    title: options?.fallbackTitle ?? message.title,
    description: options?.fallbackDescription ?? message.description,
  };
}
