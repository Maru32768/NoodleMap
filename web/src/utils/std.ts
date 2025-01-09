export function isBooleanStr(s: string | undefined | null) {
  return (s ?? "").toLowerCase() === "true";
}

export function assertNever(o: never): Error {
  return new Error(`${o} is invalid type.`);
}
