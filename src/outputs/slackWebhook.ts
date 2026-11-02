import type { OutputAdapter } from "../types.js";
import { OutputNotConfiguredError } from "./errors.js";

const SLACK_MESSAGE_LIMIT = 3500; // Slack truncates around 4000 characters; leave margin.

export class SlackNotConfiguredError extends OutputNotConfiguredError {}

/** Posts the text to a Slack Incoming Webhook, split on line boundaries to stay under Slack's limit. */
export class SlackWebhookOutput implements OutputAdapter {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    if (!url) throw new SlackNotConfiguredError("Slack is not configured: SLACK_WEBHOOK_URL is missing.");
  }

  async deliver(text: string): Promise<void> {
    const chunks: string[] = [];
    let current = "";
    for (const line of text.split("\n")) {
      if (current && current.length + line.length + 1 > SLACK_MESSAGE_LIMIT) {
        chunks.push(current);
        current = "";
      }
      current += (current ? "\n" : "") + line;
    }
    if (current) chunks.push(current);

    for (const chunk of chunks) {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Slack webhook failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    }
  }
}
