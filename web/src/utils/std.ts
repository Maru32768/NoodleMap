export function isBooleanStr(s: string | undefined | null) {
  return (s ?? "").toLowerCase() === "true";
}
