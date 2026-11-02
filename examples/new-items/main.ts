/**
 * Runnable example of the whole pattern:
 *
 *   npx tsx examples/new-items/main.ts new-items --no-delivery   # dry run, prints the raw output
 *   npx tsx examples/new-items/main.ts new-items                 # first run: seeds the memory, announces nothing
 *   (edit items.json to add or reassign an item)
 *   npx tsx examples/new-items/main.ts new-items                 # announces only what changed
 *
 * The runtime only READS and renders. The apply adapter is the only thing that writes (the "already
 * announced" memory) and it does so in `deferredCommit`, after the output confirmed delivery.
 */
import fs from "node:fs";
import path from "node:path";
import { createRunner, runCli, SeenStore, type ApplyResult } from "../../src/index.js";

interface Item {
  id: string;
  title: string;
  assignee: string;
}

const ROOT = path.resolve(import.meta.dirname, "../..");
const BLOCK_RE = /\n?<!--\s*example:new-items(\s+seed)?\s*\n([\s\S]*?)-->\n?/;

const runner = createRunner({
  automationsDir: path.join(ROOT, "examples/new-items/automations"),
  stateDir: path.join(ROOT, "state"),
  logsDir: path.join(ROOT, "logs"),
  defaultCwd: ROOT,
});
const seenFile = path.join(ROOT, "state", "new-items-seen.json");

// Runtime: reads items.json and returns the message plus a machine-readable block for the apply adapter.
runner.registerRuntime("items-file", () => ({
  async run(input) {
    const started = Date.now();
    const file = path.resolve(input.cwd, String(input.options?.file ?? "items.json"));
    const items = JSON.parse(fs.readFileSync(file, "utf8")) as Item[];
    const store = new SeenStore(seenFile);
    const seed = !store.exists;
    // The stamp is the assignee, so a reassignment is a new event and an untouched item is not.
    const events = items.map((i) => ({ ...i, key: i.id, stamp: i.assignee }));
    const fresh = seed ? events : store.fresh(events);
    const block = JSON.stringify({ open: Object.fromEntries(events.map((e) => [e.key, e.stamp])) });
    const marker = `<!-- example:new-items${seed ? " seed" : ""}\n${block}\n-->`;
    const message = fresh.map((e) => `• ${e.id} «${e.title}» → ${e.assignee}`).join("\n");
    return { success: true, output: seed || fresh.length === 0 ? marker : `${message}\n\n${marker}`, exitCode: 0, durationMs: Date.now() - started, error: null };
  },
}));

// Apply: decides what the output means for delivery and for the memory.
runner.registerApply("seen-items", () => ({
  async apply(raw): Promise<ApplyResult> {
    const match = BLOCK_RE.exec(raw);
    if (!match) return { deliveredText: raw, appliedCount: 0, errors: [], skipDelivery: true, skipReason: "no machine block" };
    const open = (JSON.parse(match[2]) as { open: Record<string, string> }).open;
    const text = (raw.slice(0, match.index) + raw.slice(match.index + match[0].length)).trim();
    const store = new SeenStore(seenFile);
    if (match[1] || text === "") {
      store.commit(open); // seed, or nothing new: remembering is safe because there is nothing to announce
      return { deliveredText: "", appliedCount: 0, errors: [], skipDelivery: true, skipReason: match[1] ? "first run: seeded" : "nothing new" };
    }
    // There is something to announce: remember it only once the message was actually delivered.
    return { deliveredText: text, appliedCount: 0, errors: [], deferredCommit: async () => (store.commit(open), { appliedCount: Object.keys(open).length, errors: [] }) };
  },
}));

process.exit(await runCli(runner, process.argv.slice(2)));
