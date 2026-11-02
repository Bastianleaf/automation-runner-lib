import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { AutomationDefinition } from "./types.js";

export function listAutomationIds(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => f.replace(/\.ya?ml$/, ""));
}

/** Loads and validates `<dir>/<id>.yml`. The `id` field must match the file name. */
export function loadAutomation(dir: string, id: string): AutomationDefinition {
  const filePath = ["yml", "yaml"].map((ext) => path.join(dir, `${id}.${ext}`)).find((p) => fs.existsSync(p));
  if (!filePath) {
    throw new Error(`No automation "${id}" (looked in ${dir}). Available: ${listAutomationIds(dir).join(", ") || "(none)"}`);
  }
  const parsed = parse(fs.readFileSync(filePath, "utf8")) as Partial<AutomationDefinition> | null;
  if (!parsed || parsed.id !== id) throw new Error(`${filePath}: "id" ("${parsed?.id}") does not match the file name ("${id}")`);
  if (!parsed.action?.skill) throw new Error(`${filePath}: missing "action.skill"`);
  if (!parsed.runtime?.provider) throw new Error(`${filePath}: missing "runtime.provider"`);
  // `outputs: []` is valid on purpose: an automation whose only effect is its apply step has nothing to push.
  if (parsed.outputs === undefined) throw new Error(`${filePath}: missing "outputs" (use "outputs: []" to deliver nothing)`);
  if (parsed.outputs.some((o) => !o?.provider)) throw new Error(`${filePath}: every item of "outputs" needs "provider"`);
  return parsed as AutomationDefinition;
}
