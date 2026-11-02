import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRunner, OutputNotConfiguredError, type ApplyResult, type AutomationDefinition } from "./index.js";

function setup(messages?: Parameters<typeof createRunner>[0]["messages"]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-"));
  const runner = createRunner({ automationsDir: path.join(dir, "automations"), stateDir: path.join(dir, "state"), logsDir: path.join(dir, "logs"), messages });
  const delivered: string[] = [];
  runner.registerRuntime("echo", () => ({
    run: async (input) => ({ success: input.skill !== "boom", output: `out:${input.skill}`, exitCode: input.skill === "boom" ? 1 : 0, durationMs: 1, error: input.skill === "boom" ? "exploded" : null }),
  }));
  runner.registerOutput("capture", () => ({ deliver: async (t) => void delivered.push(t) }));
  runner.registerOutput("broken", () => ({
    deliver: async () => {
      throw new Error("network down");
    },
  }));
  runner.registerOutput("unconfigured", () => {
    throw new OutputNotConfiguredError("no token");
  });
  return { dir, runner, delivered };
}

const def = (over: Partial<AutomationDefinition> = {}): AutomationDefinition => ({
  id: "job",
  action: { skill: "ok" },
  runtime: { provider: "echo" },
  outputs: [{ provider: "capture" }],
  ...over,
});

test("a successful run delivers the runtime output and records the state", async () => {
  const { runner, delivered } = setup();
  assert.equal(await runner.runDefinition(def()), 0);
  assert.deepEqual(delivered, ["out:ok"]);
  assert.equal(runner.status("job")?.deliveryStatus, "sent");
});

test("noDelivery is a true dry run: no apply, no delivery", async () => {
  const { runner, delivered } = setup();
  let applied = false;
  runner.registerApply("mark", () => ({ apply: async () => ((applied = true), { deliveredText: "", appliedCount: 0, errors: [] }) }));
  assert.equal(await runner.runDefinition(def({ apply: { provider: "mark" } }), { noDelivery: true }), 0);
  assert.equal(applied, false);
  assert.deepEqual(delivered, []);
});

test("deferredCommit runs only after a successful delivery", async () => {
  const { runner } = setup();
  let commits = 0;
  runner.registerApply("deferred", () => ({
    apply: async (raw): Promise<ApplyResult> => ({ deliveredText: raw, appliedCount: 0, errors: [], deferredCommit: async () => ((commits += 1), { appliedCount: 1, errors: [] }) }),
  }));
  assert.equal(await runner.runDefinition(def({ apply: { provider: "deferred" } })), 0);
  assert.equal(commits, 1);
  assert.equal(runner.status("job")?.appliedCount, 1);
});

test("deferredCommit is skipped when delivery failed, so nothing is remembered that nobody received", async () => {
  const { runner } = setup();
  let commits = 0;
  runner.registerApply("deferred", () => ({
    apply: async (raw): Promise<ApplyResult> => ({ deliveredText: raw, appliedCount: 0, errors: [], deferredCommit: async () => ((commits += 1), { appliedCount: 1, errors: [] }) }),
  }));
  assert.equal(await runner.runDefinition(def({ apply: { provider: "deferred" }, outputs: [{ provider: "broken" }] })), 1);
  assert.equal(commits, 0);
  assert.equal(runner.status("job")?.deliveryStatus, "failed");
});

test("skipDelivery from the apply adapter calls no output and is recorded as skipped_empty", async () => {
  const { runner, delivered } = setup();
  runner.registerApply("quiet", () => ({ apply: async () => ({ deliveredText: "", appliedCount: 0, errors: [], skipDelivery: true, skipReason: "nothing new" }) }));
  assert.equal(await runner.runDefinition(def({ apply: { provider: "quiet" } })), 0);
  assert.deepEqual(delivered, []);
  assert.equal(runner.status("job")?.deliveryStatus, "skipped_empty");
});

test("one failing output never skips the others; an unconfigured one is not a failure", async () => {
  const { runner, delivered } = setup();
  const code = await runner.runDefinition(def({ outputs: [{ provider: "broken" }, { provider: "unconfigured" }, { provider: "capture" }] }));
  assert.equal(code, 1);
  assert.deepEqual(delivered, ["out:ok"]);
  assert.deepEqual(runner.status("job")?.deliveries, { broken: "failed", unconfigured: "not_configured", capture: "sent" });
});

test("a failed run sends a failure notice unless deliverFailureNotice is false", async () => {
  const a = setup();
  assert.equal(await a.runner.runDefinition(def({ action: { skill: "boom" } })), 1);
  assert.match(a.delivered[0], /failed running "boom"[\s\S]*exploded/);
  const b = setup();
  assert.equal(await b.runner.runDefinition(def({ action: { skill: "boom" }, deliverFailureNotice: false })), 1);
  assert.deepEqual(b.delivered, []);
});

test("an unknown provider names what is registered", async () => {
  const { runner } = setup();
  await assert.rejects(runner.runDefinition(def({ runtime: { provider: "nope" } })), /Runtime "nope" is not registered\. Registered: echo/);
});

test("the failure and apply-failure texts can be overridden", async () => {
  const { runner, delivered } = setup({ failureNotice: (a, e) => `FALLÓ ${a.id}: ${e}`, applyFailure: (p, m, o) => `${o} | ${p}: ${m}` });
  runner.registerApply("throws", () => ({
    apply: async () => {
      throw new Error("disk full");
    },
  }));
  await runner.runDefinition(def({ action: { skill: "boom" } }));
  await runner.runDefinition(def({ apply: { provider: "throws" } }));
  assert.deepEqual(delivered, ["FALLÓ job: exploded", "out:ok | throws: disk full"]);
});
