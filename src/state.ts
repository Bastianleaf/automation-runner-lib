import fs from "node:fs";
import path from "node:path";
import type { RunState } from "./types.js";

/** Atomic JSON write (temp file + rename), so a crash never leaves a half-written file. */
export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(`${file}.tmp`, file);
}

const runFile = (stateDir: string, id: string) => path.join(stateDir, "runs", `${id}.json`);

export function writeRunState(stateDir: string, state: RunState): void {
  writeJsonAtomic(runFile(stateDir, state.automationId), state);
}

export function readRunState(stateDir: string, id: string): RunState | null {
  const file = runFile(stateDir, id);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as RunState) : null;
}
