import type { OutputAdapter } from "../types.js";

/** Prints the text to stdout. Needs no credentials: handy for local runs and examples. */
export class ConsoleOutput implements OutputAdapter {
  async deliver(text: string): Promise<void> {
    console.log(text);
  }
}
