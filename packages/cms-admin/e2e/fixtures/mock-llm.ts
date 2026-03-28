/**
 * F99 — Mock LLM fixture for Playwright E2E tests.
 *
 * Intercepts requests to Anthropic API and returns deterministic responses.
 * $0 cost — no real API calls made.
 */
import type { Page } from "@playwright/test";

const MOCK_TEXT_RESPONSE = {
  id: "msg_test_mock",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Mock AI response for testing." }],
  model: "claude-sonnet-4-6",
  stop_reason: "end_turn",
  usage: { input_tokens: 50, output_tokens: 20 },
};

/** Intercept all Anthropic API calls with a generic text response */
export async function mockLlmResponses(page: Page) {
  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_TEXT_RESPONSE),
    }),
  );
}

/** Intercept Anthropic API with a custom text response */
export async function mockLlmWithResponse(page: Page, text: string) {
  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MOCK_TEXT_RESPONSE,
        content: [{ type: "text", text }],
      }),
    }),
  );
}

/** Intercept Anthropic API with a streaming SSE response */
export async function mockLlmStreaming(page: Page, text: string) {
  const events = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-4-6", usage: { input_tokens: 50, output_tokens: 0 } } })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  ];

  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: events.join(""),
    }),
  );
}
