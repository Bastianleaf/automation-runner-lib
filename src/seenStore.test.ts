import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SeenStore } from "./seenStore.js";

const store = () => new SeenStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "seen-")), "nested", "seen.json"));

test("does not exist until the first commit, which makes the seed run detectable", () => {
  const s = store();
  assert.equal(s.exists, false);
  s.commit({ a: "1" });
  assert.equal(s.exists, true);
});

test("fresh returns new keys and changed stamps, not the ones already remembered", () => {
  const s = store();
  s.commit({ a: "1", b: "1" });
  const fresh = s.fresh([{ key: "a", stamp: "1" }, { key: "b", stamp: "2" }, { key: "c", stamp: "1" }]);
  assert.deepEqual(fresh.map((e) => e.key), ["b", "c"]);
});

test("commit replaces the memory, so closed items are forgotten and can be announced again", () => {
  const s = store();
  s.commit({ a: "1", b: "1" });
  s.commit({ a: "1" });
  assert.deepEqual(s.fresh([{ key: "b", stamp: "1" }]).map((e) => e.key), ["b"]);
});
