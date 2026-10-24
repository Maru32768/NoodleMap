import { ModalDialog } from "@/components/modal-dialog.tsx";
import { renderWithProviders } from "@/test/render.tsx";
import { screen, waitFor } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Like the shop edit modal: mounted already open, with a confirm dialog on top.
function EditWithConfirm() {
  const [state, setState] = useState<"page" | "editing" | "deleted">("page");
  const [editOpen, setEditOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (state !== "editing") {
    return (
      <>
        {state === "deleted" && <p>削除しました</p>}
        <button type="button" onClick={() => setState("editing")}>
          編集
        </button>
      </>
    );
  }
  return (
    <>
      <ModalDialog open={editOpen} onOpenChange={setEditOpen} title="編集">
        <button type="button" onClick={() => setConfirmOpen(true)}>
          削除
        </button>
      </ModalDialog>
      <ModalDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="確認"
      >
        {/* Like a deleted shop: both dialogs unmount in one commit. */}
        <button type="button" onClick={() => setState("deleted")}>
          削除する
        </button>
      </ModalDialog>
    </>
  );
}

// zag starts tracking a dialog (its Escape listener, the focus trap, inert
// page) a frame after the open effects run, and React flushes those effects
// on its own schedule here (outside act()), so a fixed number of frames can
// fall short on a loaded machine. Wait for what that tracking does instead.

/** The topmost dialog listens for Escape once it has made the page inert. */
const dismissable = () =>
  waitFor(() => expect(document.body).toHaveAttribute("data-inert"));

/** A dialog's focus trap is active once focus has moved into it. */
const focusTrapped = (dialog: HTMLElement) =>
  waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

// Clicks go straight to the DOM, outside act(), so React flushes the StrictMode
// double effects like a browser does: synchronously after the click's commit.
const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
beforeEach(() => {
  previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});
afterEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

describe("ModalDialog under StrictMode", () => {
  it("leaves the page usable after a dialog that mounted open closes", async () => {
    renderWithProviders(
      <StrictMode>
        <EditWithConfirm />
      </StrictMode>,
    );
    screen.getByRole("button", { name: "編集" }).click();
    await screen.findByRole("button", { name: "削除" });
    await dismissable();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "削除" })).toBeNull(),
    );

    await waitFor(() => {
      expect(document.body).not.toHaveStyle({ overflow: "hidden" });
      expect(document.querySelector("[aria-hidden=true]")).toBeNull();
    });
  });

  it("unmounts a dialog together with the one it opened without throwing", async () => {
    renderWithProviders(
      <StrictMode>
        <EditWithConfirm />
      </StrictMode>,
    );
    screen.getByRole("button", { name: "編集" }).click();
    const remove = await screen.findByRole("button", { name: "削除" });
    await focusTrapped(remove.closest<HTMLElement>("[role=dialog]")!);
    remove.click();
    const confirm = await screen.findByRole("button", { name: "削除する" });
    // The confirm dialog's focus trap activates over the edit dialog's.
    await focusTrapped(confirm.closest<HTMLElement>("[role=dialog]")!);

    confirm.click();

    expect(await screen.findByText("削除しました")).toBeInTheDocument();
  });
});
