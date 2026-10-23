import { useEffect, useRef } from "react";

const INVALID = '[aria-invalid="true"], [data-part="error-text"]';

/**
 * After `reveal()`, the next render focuses the first invalid input inside
 * `ref` (or scrolls to the first error message of a control group), so an
 * error below the fold, e.g. on a phone, is not missed.
 */
export function useRevealFirstError<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (!pending.current) {
      return;
    }
    pending.current = false;
    const target = ref.current?.querySelector<HTMLElement>(INVALID);
    if (!target) {
      return;
    }
    if (target.matches("input, select, textarea")) {
      target.focus();
    } else if (target.matches("[role=radiogroup]")) {
      // The group's Tab stop: the chosen option, or the first.
      target.querySelector<HTMLElement>('[role=radio][tabindex="0"]')?.focus();
    }
    // jsdom has no scrollIntoView.
    target.scrollIntoView?.({ block: "center" });
  });

  return {
    ref,
    reveal: () => {
      pending.current = true;
    },
  };
}
