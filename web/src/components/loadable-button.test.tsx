import { LoadableButton } from "@/components/loadable-button.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("LoadableButton", () => {
  it("stays disabled while the returned promise is pending", async () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const onClick = vi.fn(() => promise);
    renderWithProviders(
      <LoadableButton onClick={onClick}>保存</LoadableButton>,
    );
    const button = screen.getByRole("button", { name: "保存" });

    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      resolve();
      await promise;
    });
    expect(button).toBeEnabled();
  });

  it("does not enter a loading state for a synchronous handler", async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <LoadableButton onClick={onClick}>閉じる</LoadableButton>,
    );
    const button = screen.getByRole("button", { name: "閉じる" });

    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
  });

  it("honors an external loading prop", () => {
    renderWithProviders(<LoadableButton loading>保存</LoadableButton>);

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });
});
