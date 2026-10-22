// shortcut: hand-written User-Agent sniffing covers mainstream browsers/OSes only;
// switch to a UA parser library if device labels need to be more precise.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

// Order matters: iOS UAs contain "Mac OS X" and Android UAs contain "Linux".
const OSES: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function match(
  ua: string,
  table: ReadonlyArray<readonly [RegExp, string]>,
): string | undefined {
  return table.find(([pattern]) => pattern.test(ua))?.[1];
}

/** A short device label such as "Chrome / Windows" inferred from a User-Agent. */
export function describeUserAgent(ua: string | undefined): string {
  const browser = ua ? match(ua, BROWSERS) : undefined;
  const os = ua ? match(ua, OSES) : undefined;
  if (!browser && !os) {
    return "不明な端末";
  }
  return `${browser ?? "不明なブラウザ"} / ${os ?? "不明なOS"}`;
}
