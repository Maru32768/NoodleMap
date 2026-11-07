import { Box } from "@chakra-ui/react";
import { ComponentProps } from "react";

export const outlineButton = {
  variant: "plain",
  px: "14px",
  py: "8px",
  h: "auto",
  minH: "auto",
  fontSize: "13px",
  border: "1px solid",
  borderColor: "nm.line",
  rounded: "nmMd",
  _hover: { borderColor: "nm.ink" },
} as const;

export const primaryButton = {
  variant: "plain",
  px: "16px",
  py: "8px",
  h: "auto",
  minH: "auto",
  fontSize: "13px",
  fontWeight: 600,
  bg: "nm.shu",
  color: "white",
  rounded: "nmMd",
  _hover: { bg: "nm.shuDeep" },
} as const;

/** A button that opens the file picker. Choosing the same file again fires `onFiles` again. */
export function FileButton({
  onFiles,
  accept,
  multiple,
  disabled,
  children,
  ...style
}: ComponentProps<typeof Box> & {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
}) {
  return (
    <Box
      as="label"
      {...style}
      cursor={disabled ? "default" : "pointer"}
      opacity={disabled ? 0.5 : 1}
    >
      {children}
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        hidden
        disabled={disabled}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) {
            onFiles(files);
          }
        }}
      />
    </Box>
  );
}
