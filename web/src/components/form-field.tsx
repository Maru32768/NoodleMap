import { BoxProps, Field } from "@chakra-ui/react";
import { ReactNode } from "react";

function ErrorText({ error }: { error?: string }) {
  return (
    <Field.ErrorText mt="4px" fontSize="11px">
      {error}
    </Field.ErrorText>
  );
}

/**
 * A label, its control and an error message. With an error the input is marked
 * aria-invalid and described by the message. Every input inside shares the
 * field's id, so wrap at most one; use {@link FieldError} below a list of inputs.
 */
export function FormField({
  label,
  error,
  gridColumn,
  children,
}: {
  label?: ReactNode;
  error?: string;
  gridColumn?: BoxProps["gridColumn"];
  children: ReactNode;
}) {
  return (
    <Field.Root invalid={!!error} display="block" gridColumn={gridColumn}>
      {label}
      {children}
      <ErrorText error={error} />
    </Field.Root>
  );
}

/** A standalone error message for a group of controls. */
export function FieldError({ error }: { error?: string }) {
  return (
    <Field.Root invalid={!!error} display="block">
      <ErrorText error={error} />
    </Field.Root>
  );
}
