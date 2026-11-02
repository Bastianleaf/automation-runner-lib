import type { Runner } from "./runner.js";

/**
 * Minimal CLI over a configured runner:
 *   <bin> <automation-id> [--no-delivery]
 *   <bin> status [automation-id]
 * Returns the exit code; the caller decides whether to `process.exit` with it.
 */
export async function runCli(runner: Runner, argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(`Usage:\n  <bin> <automation-id> [--no-delivery]\n  <bin> status [automation-id]\n\nAutomations: ${runner.automationIds.join(", ") || "(none)"}`);
    return 0;
  }
  if (command === "status") {
    for (const id of rest[0] ? [rest[0]] : runner.automationIds) {
      const state = runner.status(id);
      console.log(`\n${id}\n${state ? JSON.stringify(state, null, 2) : "  (no runs yet)"}`);
    }
    return 0;
  }
  try {
    return await runner.run(command, { noDelivery: rest.includes("--no-delivery") || rest.includes("--dry-run") });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
