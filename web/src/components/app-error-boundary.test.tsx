import { AppErrorBoundary } from "@/components/app-error-boundary.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

function Broken(): never {
  throw new Error("boom");
}

describe("AppErrorBoundary", () => {
  it("shows a reload prompt instead of a blank page", () => {
    // React logs the caught error; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("エラーが発生しました");
    expect(
      screen.getByRole("button", { name: "再読み込み" }),
    ).toBeInTheDocument();
  });
});
