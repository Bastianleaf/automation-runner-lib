import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSecrets, loadDotEnv } from "./secrets.js";

test("parses dotenv syntax: quotes, comments, blank lines, '=' inside values", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "env-")), ".env");
  fs.writeFileSync(file, `# comment\nA=1\nB="two words"\nC='x'\n\nD=a=b\n`);
  assert.deepEqual(loadDotEnv(file), { A: "1", B: "two words", C: "x", D: "a=b" });
});

test("the environment wins over the file; a missing secret is an empty string", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "env-")), ".env");
  fs.writeFileSync(file, "RUNNER_TEST_A=file\nRUNNER_TEST_B=file\n");
  process.env.RUNNER_TEST_A = "env";
  const secret = createSecrets(file);
  assert.equal(secret("RUNNER_TEST_A"), "env");
  assert.equal(secret("RUNNER_TEST_B"), "file");
  assert.equal(secret("RUNNER_TEST_MISSING"), "");
  delete process.env.RUNNER_TEST_A;
});
