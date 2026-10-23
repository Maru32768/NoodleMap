import { AppErrorBoundary } from "@/components/app-error-boundary.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { APP_ERROR_RELOAD_LABEL, APP_ERROR_TITLE } from "@/utils/toast.ts";
import { screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";

function Broken(): never {
  throw new Error("boom");
}

describe("AppErrorBoundary", () => {
  it("shows a reload prompt and logs the error with its marker", () => {
    // React also logs the caught error; keep the test output clean.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    onTestFinished(() => consoleError.mockRestore());

    renderWithProviders(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(APP_ERROR_TITLE);
    expect(
      screen.getByRole("button", { name: APP_ERROR_RELOAD_LABEL }),
    ).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "[AppErrorBoundary]",
      expect.objectContaining({ message: "boom" }),
      expect.any(String),
    );
  });
});
