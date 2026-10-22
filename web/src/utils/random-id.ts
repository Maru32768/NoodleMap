/**
 * A random, URL-safe id (at most 36 chars). `crypto.randomUUID` only exists in secure
 * contexts (not e.g. plain-HTTP LAN dev), so fall back to 32 random hex chars there.
 */
export function randomId(): string {
  return (
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
