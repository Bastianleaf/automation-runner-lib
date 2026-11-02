import fs from "node:fs";
import path from "node:path";

/** JSON-lines log per automation, echoed to stdout/stderr so `journalctl` shows it too. */
export class Logger {
  private readonly logPath: string;

  constructor(
    private readonly automationId: string,
    logsDir: string
  ) {
    fs.mkdirSync(logsDir, { recursive: true });
    this.logPath = path.join(logsDir, `${automationId}.log`);
  }

  private write(level: "info" | "warn" | "error", event: string, details?: Record<string, unknown>) {
    const line = { ts: new Date().toISOString(), level, automationId: this.automationId, event, ...details };
    fs.appendFileSync(this.logPath, JSON.stringify(line) + "\n");
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`[${line.ts}] ${this.automationId} ${event}` + (details ? ` ${JSON.stringify(details)}` : "") + "\n");
  }

  info(event: string, details?: Record<string, unknown>) {
    this.write("info", event, details);
  }
  warn(event: string, details?: Record<string, unknown>) {
    this.write("warn", event, details);
  }
  error(event: string, details?: Record<string, unknown>) {
    this.write("error", event, details);
  }
}
