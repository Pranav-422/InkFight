// Self-check for the pure parts of the result card: which scores a share link may carry, and how a stored battle's score is read.
//   npx tsx scripts/check-share.ts

import assert from "node:assert/strict";
import { battleScore, parseScore } from "../src/lib/shareScore";

// A match is first to two rounds: 2-0 and 2-1 either way round are the only results.
for (const [a, b] of [[2, 0], [2, 1], [0, 2], [1, 2]]) assert.deepEqual(parseScore(a, b), [a, b]);
assert.deepEqual(parseScore("2", "1"), [2, 1], "query strings are numbers in text");
for (const [a, b] of [[2, 2], [1, 1], [0, 0], [3, 0], [2, -1], [1, 0], [2.5, 0], ["x", 1], [undefined, 1], [null, null], ["", ""], [2, 3]]) {
  assert.equal(parseScore(a, b), null, `${String(a)}-${String(b)} should be refused`);
}

// A stored battle's score comes from its log; a log without a valid one is shown as 2-0 for the winner.
assert.deepEqual(battleScore(JSON.stringify({ mode: "p2p", wins: [1, 2] }), false), [1, 2]);
assert.deepEqual(battleScore(JSON.stringify({ wins: [2, 0] }), true), [2, 0]);
assert.deepEqual(battleScore("{}", true), [2, 0]);
assert.deepEqual(battleScore("{}", false), [0, 2]);
assert.deepEqual(battleScore("not json", false), [0, 2]);
assert.deepEqual(battleScore(JSON.stringify({ wins: [2, 2] }), true), [2, 0], "an impossible stored score falls back");

console.log("check-share: all good");
