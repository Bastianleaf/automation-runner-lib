import path from "node:path";
import { listAutomationIds, loadAutomation } from "./loadAutomation.js";
import { Logger } from "./logger.js";
import { OutputNotConfiguredError } from "./outputs/errors.js";
import { ConsoleOutput } from "./outputs/console.js";
import { SlackWebhookOutput } from "./outputs/slackWebhook.js";
import { Registry } from "./registry.js";
import { createSecrets } from "./secrets.js";
import { readRunState, writeRunState } from "./state.js";
import type { ApplyAdapter, AutomationDefinition, DeliveryStatus, OutputAdapter, RunState, RuntimeAdapter } from "./types.js";

export interface RunnerConfig {
  /** Where `<id>.yml` definitions live. */
  automationsDir: string;
  /** Run states, locks and any adapter memory. Default: `<cwd>/state`. */
  stateDir?: string;
  /** JSON-lines logs. Default: `<cwd>/logs`. */
  logsDir?: string;
  /** Optional dotenv file consulted when a secret is not in the environment. */
  secretsFile?: string;
  /** Working directory handed to runtimes when the automation does not set `action.cwd`. Default: `process.cwd()`. */
  defaultCwd?: string;
}

/** What every adapter factory receives. */
export interface AdapterContext {
  logger: Logger;
  secret(name: string): string;
  stateDir: string;
}

export interface OutputContext extends AdapterContext {
  automationId: string;
  /** The message reports a failure, not a normal result. */
  failed: boolean;
  /** The automation's non-secret `runtime.options`. */
  options?: Record<string, unknown>;
}

export interface RunOptions {
  /** Runs the runtime and prints its output, but never applies nor delivers anything: a true dry run. */
  noDelivery?: boolean;
}

export class Runner {
  readonly runtimes = new Registry<(ctx: AdapterContext) => RuntimeAdapter>("Runtime");
  readonly applies = new Registry<(ctx: AdapterContext) => ApplyAdapter>("Apply adapter");
  readonly outputs = new Registry<(ctx: OutputContext) => OutputAdapter>("Output");

  private readonly stateDir: string;
  private readonly logsDir: string;
  private readonly secret: (name: string) => string;

  constructor(private readonly config: RunnerConfig) {
    this.stateDir = config.stateDir ?? path.join(process.cwd(), "state");
    this.logsDir = config.logsDir ?? path.join(process.cwd(), "logs");
    this.secret = createSecrets(config.secretsFile);
    // Built-ins that need no extra dependency.
    this.outputs.register("console", () => new ConsoleOutput());
    this.outputs.register("slack-webhook", (ctx) => new SlackWebhookOutput(ctx.secret("SLACK_WEBHOOK_URL")));
  }

  registerRuntime(name: string, factory: (ctx: AdapterContext) => RuntimeAdapter): this {
    this.runtimes.register(name, factory);
    return this;
  }
  registerApply(name: string, factory: (ctx: AdapterContext) => ApplyAdapter): this {
    this.applies.register(name, factory);
    return this;
  }
  registerOutput(name: string, factory: (ctx: OutputContext) => OutputAdapter): this {
    this.outputs.register(name, factory);
    return this;
  }

  get automationIds(): string[] {
    return listAutomationIds(this.config.automationsDir);
  }

  status(id: string): RunState | null {
    return readRunState(this.stateDir, id);
  }

  /** Loads `<automationsDir>/<id>.yml` and runs it. Returns the process exit code (0 = success). */
  async run(id: string, options: RunOptions = {}): Promise<number> {
    return this.runDefinition(loadAutomation(this.config.automationsDir, id), options);
  }

  async runDefinition(automation: AutomationDefinition, options: RunOptions = {}): Promise<number> {
    const noDelivery = options.noDelivery ?? false;
    const logger = new Logger(automation.id, this.logsDir);
    const ctx: AdapterContext = { logger, secret: this.secret, stateDir: this.stateDir };
    const startedAt = new Date();
    logger.info("run_start", { skill: automation.action.skill, runtime: automation.runtime.provider, noDelivery });

    const runtime = this.runtimes.get(automation.runtime.provider)(ctx);
    const cwd = automation.action.cwd ?? this.config.defaultCwd ?? process.cwd();
    const result = await runtime.run({
      skill: automation.action.skill,
      cwd,
      args: automation.action.args,
      tools: automation.runtime.tools,
      timeoutMs: automation.runtime.timeoutMs,
      options: automation.runtime.options,
    });
    logger.info("runtime_finished", { success: result.success, exitCode: result.exitCode, durationMs: result.durationMs });
    if (!result.success) logger.error("runtime_failed", { error: result.error });

    let deliveryStatus: DeliveryStatus = "skipped";
    let deliveries: Record<string, DeliveryStatus> | undefined;
    let appliedCount: number | undefined;
    let applyErrors: string[] | undefined;
    let skipDelivery = false;
    let skipReason: string | undefined;
    let deferredCommit: (() => Promise<{ appliedCount: number; errors: string[] }>) | undefined;
    let outputForDelivery = result.output;

    if (noDelivery) console.log(`\n--- output (${automation.id}) ---\n${result.output}\n--- end output ---\n`);

    if (result.success && automation.apply && !noDelivery) {
      try {
        const applied = await this.applies.get(automation.apply.provider)(ctx).apply(result.output, cwd);
        outputForDelivery = applied.deliveredText;
        appliedCount = applied.appliedCount;
        applyErrors = applied.errors;
        skipDelivery = applied.skipDelivery ?? false;
        skipReason = applied.skipReason;
        deferredCommit = applied.deferredCommit;
        logger.info("apply_finished", { provider: automation.apply.provider, appliedCount: applied.appliedCount, errorCount: applied.errors.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("apply_failed", { provider: automation.apply.provider, error: message });
        applyErrors = [message];
        outputForDelivery = `${result.output}\n\n⚠️ The apply step failed (${automation.apply.provider}): ${message}`;
      }
    }

    if (!noDelivery && result.success && skipDelivery) {
      // The apply adapter confirmed there is nothing new to send: still logged and in the run state, so
      // a quiet run stays distinguishable from a silent failure.
      deliveryStatus = "skipped_empty";
      logger.info("delivery_skipped_empty", { reason: skipReason ?? "no reason given" });
    } else if (!noDelivery && !result.success && automation.deliverFailureNotice === false) {
      logger.info("delivery_skipped_failure_notice", { reason: "deliverFailureNotice: false" });
    } else if (!noDelivery) {
      const message = result.success
        ? outputForDelivery
        : `⚠️ Automation "${automation.id}" failed running "${automation.action.skill}".\n\n${result.error ?? "Unknown error"}`;
      deliveries = await this.deliverToAll(automation, message, !result.success, ctx);
      deliveryStatus = aggregate(Object.values(deliveries));

      if (deferredCommit) {
        // The whole point of the deferred commit: it only runs once the message really went out.
        if (result.success && deliveryStatus === "sent") {
          const committed = await deferredCommit();
          appliedCount = committed.appliedCount;
          applyErrors = [...(applyErrors ?? []), ...committed.errors];
          logger.info("apply_committed", { appliedCount: committed.appliedCount, errorCount: committed.errors.length });
        } else {
          logger.warn("apply_skipped_not_delivered", { deliveryStatus });
        }
      }
    } else {
      logger.info("delivery_skipped", { reason: "noDelivery" });
    }

    const finishedAt = new Date();
    writeRunState(this.stateDir, {
      automationId: automation.id,
      lastRun: finishedAt.toISOString(),
      status: result.success ? "success" : "failure",
      runtime: automation.runtime.provider,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      deliveryStatus,
      deliveries,
      error: result.error,
      appliedCount,
      applyErrors,
    });
    logger.info("run_finished", { status: result.success ? "success" : "failure", deliveryStatus, durationMs: result.durationMs });
    return result.success && deliveryStatus !== "failed" ? 0 : 1;
  }

  /** Delivers to every configured output independently: one failing never skips the others. */
  async deliverToAll(automation: AutomationDefinition, message: string, failed: boolean, ctx: AdapterContext): Promise<Record<string, DeliveryStatus>> {
    const statuses: Record<string, DeliveryStatus> = {};
    for (const { provider } of automation.outputs ?? []) {
      try {
        const output = this.outputs.get(provider)({ ...ctx, automationId: automation.id, failed, options: automation.runtime.options });
        await output.deliver(message);
        statuses[provider] = "sent";
        ctx.logger.info("delivery_sent", { provider });
      } catch (err) {
        if (err instanceof OutputNotConfiguredError) {
          statuses[provider] = "not_configured";
          ctx.logger.warn("delivery_not_configured", { provider, message: err.message });
        } else {
          statuses[provider] = "failed";
          ctx.logger.error("delivery_failed", { provider, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return statuses;
  }
}

function aggregate(statuses: DeliveryStatus[]): DeliveryStatus {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("sent")) return "sent";
  if (statuses.includes("not_configured")) return "not_configured";
  return "skipped";
}

export function createRunner(config: RunnerConfig): Runner {
  return new Runner(config);
}
