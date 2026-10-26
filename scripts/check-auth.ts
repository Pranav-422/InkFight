// Self-check for the pure auth helpers: where a login may send you, and which accounts count as the shared demos.
//   npx tsx scripts/check-auth.ts

import assert from "node:assert/strict";
import { isDemoEmail } from "../src/app/(auth)/demo";
import { safePath } from "../src/lib/safePath";

for (const ok of ["/home", "/play/AB12", "/create?room=AB12", "/player/x#y"]) assert.equal(safePath(ok), ok);
// Browsers turn a backslash or a stripped tab/newline after the first slash into "//", which leaves the site.
for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)", "home", "", undefined, null, 5]) {
  assert.equal(safePath(bad), "/home", `${JSON.stringify(bad)} should fall back`);
}
assert.equal(safePath("nope", "/"), "/");

assert.ok(isDemoEmail("demo1@inkfight.app"));
assert.ok(isDemoEmail(" Demo2@InkFight.app "));
assert.ok(!isDemoEmail("demo3@inkfight.app"));

console.log("check-auth: all good");
