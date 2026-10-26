// Only same-site relative paths after login. Browsers read "/\evil.com" and "/<tab>/evil.com" as "//evil.com",
// so a backslash or a control character anywhere makes it unsafe too.
export function safePath(v: unknown, fallback = "/home"): string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !/[\\\x00-\x1f\x7f]/.test(v) ? v : fallback;
}
