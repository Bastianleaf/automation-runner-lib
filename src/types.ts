export interface AutomationDefinition {
  id: string;
  description?: string;
  /** Documentation only: the real trigger (systemd timer, cron, ...) lives outside this library. */
  schedule?: { weekdays?: boolean; times?: string[]; timezone?: string };
  action: {
    /** Name of the unit of work the runtime executes (a skill, a script, a job id...). */
    skill: string;
    cwd?: string;
    /** Free text handed to the runtime, for runtimes that take arguments. */
    args?: string;
  };
  runtime: {
    provider: string;
    tools?: string;
    timeoutMs?: number;
    /** Provider-specific, non-secret configuration. Secrets never go here. */
    options?: Record<string, unknown>;
  };
  apply?: { provider: string };
  /**
   * Whether a failed run sends its failure notice through the outputs. Default `true`. Set `false`
   * when the channel carries content the notice would pollute; the process still exits non-zero, so
   * an external alert (e.g. systemd `OnFailure=`) can cover it.
   */
  deliverFailureNotice?: boolean;
  /** Every channel the result is delivered to. Each is attempted independently. `[]` is valid. */
  outputs?: Array<{ provider: string }>;
}

export interface RuntimeInput {
  skill: string;
  cwd: string;
  args?: string;
  tools?: string;
  timeoutMs?: number;
  options?: Record<string, unknown>;
}

export interface RuntimeResult {
  success: boolean;
  output: string;
  exitCode: number | null;
  durationMs: number;
  error: string | null;
  raw?: unknown;
}

/** Produces the text of a run. Never writes state: that is the apply adapter's job. */
export interface RuntimeAdapter {
  run(input: RuntimeInput): Promise<RuntimeResult>;
}

export interface ApplyResult {
  /** Text to actually deliver: the runtime output with the apply outcome merged in. */
  deliveredText: string;
  appliedCount: number;
  errors: string[];
  /** Positively nothing new to deliver this run: the output adapters are not called at all. */
  skipDelivery?: boolean;
  skipReason?: string;
  /**
   * When set, the adapter has NOT written anything yet. The runner calls it only after every output
   * delivered, and never if delivery failed, so a side effect that means "this was announced"
   * (remembering an event) cannot happen for a message nobody received.
   */
  deferredCommit?: () => Promise<{ appliedCount: number; errors: string[] }>;
}

/** The one place allowed to write for an automation. Deterministic code, never the runtime itself. */
export interface ApplyAdapter {
  apply(rawOutput: string, cwd: string): Promise<ApplyResult>;
}

export type DeliveryStatus = "sent" | "failed" | "skipped" | "skipped_empty" | "not_configured";

export interface OutputAdapter {
  deliver(text: string): Promise<void>;
}

export interface RunState {
  automationId: string;
  lastRun: string;
  status: "success" | "failure";
  runtime: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  durationMs: number;
  /** Aggregate: "failed" if any output failed, else "sent" if any was sent. */
  deliveryStatus: DeliveryStatus;
  deliveries?: Record<string, DeliveryStatus>;
  error: string | null;
  appliedCount?: number;
  applyErrors?: string[];
}
