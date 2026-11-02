import assert from "node:assert/strict";
import test from "node:test";
import { SlackNotConfiguredError, SlackWebhookOutput } from "./slackWebhook.js";

test("requires a webhook URL, reported as not-configured rather than a failure", () => {
  assert.throws(() => new SlackWebhookOutput(""), SlackNotConfiguredError);
});

test("splits long messages on line boundaries and posts each chunk", async () => {
  const bodies: string[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)).text);
    return new Response("ok", { status: 200 });
  }) as unknown as typeof fetch;
  const line = "x".repeat(1000);
  await new SlackWebhookOutput("https://example.invalid/hook", fakeFetch).deliver([line, line, line, line, line].join("\n"));
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every((b) => b.length <= 3500));
  assert.equal(bodies.join("\n").split("\n").length, 5);
});

test("a non-2xx response is an error", async () => {
  const fakeFetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(new SlackWebhookOutput("https://example.invalid/hook", fakeFetch).deliver("hi"), /HTTP 500/);
});
