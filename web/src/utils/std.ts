export function assertNever(o: never): never {
  throw new Error(`${o} is invalid type.`);
}
