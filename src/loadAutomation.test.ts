import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listAutomationIds, loadAutomation } from "./loadAutomation.js";

function dirWith(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-"));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}
const valid = "id: a\naction: { skill: s }\nruntime: { provider: p }\noutputs: []\n";

test("loads a valid definition and lists ids", () => {
  const dir = dirWith({ "a.yml": valid });
  assert.equal(loadAutomation(dir, "a").runtime.provider, "p");
  assert.deepEqual(listAutomationIds(dir), ["a"]);
});

test("rejects an id that does not match the file name, and missing required fields", () => {
  const dir = dirWith({ "b.yml": valid, "c.yml": "id: c\nruntime: { provider: p }\noutputs: []\n", "d.yml": "id: d\naction: { skill: s }\nruntime: { provider: p }\n" });
  assert.throws(() => loadAutomation(dir, "b"), /does not match/);
  assert.throws(() => loadAutomation(dir, "c"), /action\.skill/);
  assert.throws(() => loadAutomation(dir, "d"), /outputs/);
});

test("an unknown id lists the available ones", () => {
  assert.throws(() => loadAutomation(dirWith({ "a.yml": valid }), "zzz"), /Available: a/);
});
