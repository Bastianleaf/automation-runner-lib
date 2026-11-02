# automation-runner-lib

A small, runtime-agnostic engine for scheduled automations, extracted from a personal automation worker.
It gives you the part that is easy to get subtly wrong and tedious to rewrite:

```text
runtime adapter  ->  apply adapter  ->  output adapters  ->  run state
(produce text)       (the only writer)   (Slack, console…)    (state/runs/<id>.json)
```

- **Pluggable adapters, registered by name.** The engine knows nothing about Jira, Slack bots or LLMs.
- **Deliver, then commit.** An apply adapter can return a `deferredCommit` that the runner calls only
  after every output delivered. An event is never remembered unless somebody received the message.
- **Independent outputs.** One failing channel never skips the others; an unconfigured one is reported as
  `not_configured`, not as a failure.
- **A true dry run.** `--no-delivery` runs the runtime and prints its output, but never applies nor delivers.
- **Declarative automations.** One YAML file per automation; the trigger (cron, systemd) stays outside.
- **`SeenStore`**, the "already announced" memory for event-driven automations, with seed-run detection.

It is deliberately small (one runtime dependency, `yaml`) and has no scheduler, no web server and no
product-specific adapters.

## Install

Pin a release tag; the package builds itself on install:

```sh
npm install github:Bastianleaf/automation-runner-lib#v0.1.0
```

Requires Node 20+. See [RELEASING.md](RELEASING.md) for how versions are produced.

## Use

```ts
import { createRunner, runCli, SeenStore } from "automation-runner-lib";

const runner = createRunner({ automationsDir: "automations", secretsFile: "/etc/my-worker/.env" });

runner.registerRuntime("my-source", ({ logger, secret }) => ({
  async run(input) {
    // read something, render text, never write
    return { success: true, output: "hello", exitCode: 0, durationMs: 1, error: null };
  },
}));

process.exit(await runCli(runner, process.argv.slice(2))); // <bin> <id> [--no-delivery] | status [id]
```

```yaml
# automations/hello.yml
id: hello
action: { skill: hello }
runtime: { provider: my-source }
outputs:
  - provider: slack-webhook   # reads SLACK_WEBHOOK_URL from the environment or the secrets file
```

A complete, runnable example of the event-driven pattern (seed run, announce only what changed, commit
after delivery) is in [`examples/new-items`](examples/new-items/main.ts):

```sh
npx tsx examples/new-items/main.ts new-items --no-delivery
```

## Adapters

| Kind | Interface | Built in |
|---|---|---|
| Runtime | `run(input) -> { success, output, ... }` | none: you bring your own |
| Apply | `apply(rawOutput, cwd) -> { deliveredText, skipDelivery?, deferredCommit? }` | none |
| Output | `deliver(text)` | `console`, `slack-webhook` |

Factories receive `{ logger, secret(name), stateDir }`; output factories also get `automationId`,
`failed` and the automation's `runtime.options`.

## Development

```sh
npm ci && npm run typecheck && npm test && npm run build
```

Commits follow Conventional Commits; see [AGENTS.md](AGENTS.md) and [RELEASING.md](RELEASING.md).

## License

MIT
