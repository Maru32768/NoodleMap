import { renderWithProviders } from "@/test/render.tsx";
import { toApiError, toNetworkApiError } from "@/utils/request.ts";
import { toastApiError } from "@/utils/toast.ts";
import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const URL = "/api/v1/auth/shops";
const RETRY_LATER = "時間をおいてもう一度お試しください。";

function showToast(...args: Parameters<typeof toastApiError>) {
  renderWithProviders(null);
  act(() => {
    toastApiError(...args);
  });
}

// The toaster store is a module singleton, so earlier tests' toasts can still
// be on screen; scope assertions to the toast with the expected title.
async function findToast(title: string) {
  const titleElement = await screen.findByText(title);
  return within(titleElement.closest<HTMLElement>('[role="status"]')!);
}

describe("toastApiError", () => {
  it("prefers the message for the error body type over the status", async () => {
    showToast(
      toApiError(URL, new Response(null, { status: 400 }), {
        type: "authentication_required" as const,
      }),
    );

    const toast = await findToast("ログインが必要です");
    expect(
      toast.getByText("もう一度ログインしてから操作してください。"),
    ).toBeInTheDocument();
  });

  it("falls back to the HTTP status message", async () => {
    showToast(
      toApiError(URL, new Response(null, { status: 404 }), undefined as never),
    );

    await findToast("対象のデータが見つかりません");
  });

  it("shows a generic message for network failures", async () => {
    showToast(toNetworkApiError(URL, new TypeError("Failed to fetch")));

    const toast = await findToast("予期しないエラーが発生しました");
    expect(toast.getByText(RETRY_LATER)).toBeInTheDocument();
    expect(toast.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  it("lets the caller override the title while keeping the description", async () => {
    showToast(
      toApiError(URL, new Response(null, { status: 500 }), {
        type: "internal_error" as const,
      }),
      { fallbackTitle: "店舗一覧を読み込めませんでした" },
    );

    const toast = await findToast("店舗一覧を読み込めませんでした");
    expect(toast.getByText(RETRY_LATER)).toBeInTheDocument();
  });
});
