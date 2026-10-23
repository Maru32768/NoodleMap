/** The look of the 訪問ログ form's text and number inputs. */
export const visitInputProps = {
  w: "100%",
  px: "12px",
  py: "8px",
  h: "auto",
  bg: "nm.paper",
  border: "1px solid",
  borderColor: "nm.line",
  borderRadius: "nmMd",
  fontSize: "13px",
  color: "nm.ink",
  _focus: { borderColor: "nm.shu", bg: "white", boxShadow: "none" },
  // Field.Root marks the input invalid; the borderColor above would hide it.
  _invalid: { borderColor: "border.error" },
} as const;
