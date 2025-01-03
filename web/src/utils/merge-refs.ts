import React, { useMemo } from "react";

export type ReactRef<T> =
  | React.RefCallback<T>
  | React.MutableRefObject<T>
  | React.ForwardedRef<T>;

function assignRef<T = unknown>(ref: ReactRef<T> | null | undefined, value: T) {
  if (ref == null) return;

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  try {
    ref.current = value;
  } catch {
    throw new Error(`Cannot assign value '${value}' to ref '${ref}'`);
  }
}

export function useMergeRefs<T>(...refs: (ReactRef<T> | undefined)[]) {
  return useMemo(() => {
    if (refs.every((ref) => ref == null)) {
      return null;
    }

    return (value: T) => {
      refs.forEach((ref) => {
        if (ref) assignRef(ref, value);
      });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refs);
}
