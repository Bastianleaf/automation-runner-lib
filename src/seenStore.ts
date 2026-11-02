import fs from "node:fs";
import { writeJsonAtomic } from "./state.js";

export interface SeenEvent {
  /** Identity of the thing (a ticket, a PR, a card). */
  key: string;
  /** Its current version: when it changes, the event is new again (a reassignment, a new review). */
  stamp: string;
}

/**
 * "Already announced" memory for event-driven automations: a JSON map `key -> stamp`.
 *
 * Meant to be committed from an apply adapter's `deferredCommit`, i.e. only after the message was
 * delivered: remembering an event that nobody received would silence it for good.
 */
export class SeenStore {
  constructor(private readonly file: string) {}

  /** `false` until the first commit: use it to seed (remember what exists without announcing it). */
  get exists(): boolean {
    return fs.existsSync(this.file);
  }

  read(): Record<string, string> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Record<string, string>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Events whose stamp differs from what was remembered. */
  fresh<T extends SeenEvent>(events: T[]): T[] {
    const seen = this.read();
    return events.filter((e) => seen[e.key] !== e.stamp);
  }

  /** Replaces the memory with `entries`, so keys that are no longer open are forgotten. */
  commit(entries: Record<string, string>): void {
    writeJsonAtomic(this.file, entries);
  }
}
