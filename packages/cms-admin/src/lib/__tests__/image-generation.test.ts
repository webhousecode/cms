/**
 * Gemini Nano Banana image generation tests.
 *
 * Pure unit tests against the REST client — the Google API is mocked
 * via the injected fetchImpl. Covers prompt validation, error
 * propagation, response parsing (camelCase + snake_case), and the
 * cost stamp.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-config", () => ({
  readAiConfig: vi.fn(async () => ({ geminiApiKey: "test-key-from-config" })),
}));

import { generateImage, getGeminiImageKey, NANO_BANANA_COST_PER_IMAGE_USD } from "../ai/image-generation";
import { readAiConfig } from "@/lib/ai-config";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Z+0bMwAAAAASUVORK5CYII=";

function makeOkResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  vi.mocked(readAiConfig).mockResolvedValue({ geminiApiKey: "test-key-from-config" } as never);
});

describe("getGeminiImageKey", () => {
  it("prefers ai-config geminiApiKey", async () => {
    expect(await getGeminiImageKey()).toBe("test-key-from-config");
  });

  it("falls back to GOOGLE_GENERATIVE_AI_API_KEY env", async () => {
    vi.mocked(readAiConfig).mockResolvedValue({} as never);
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "env-google-key";
    expect(await getGeminiImageKey()).toBe("env-google-key");
  });

  it("falls back to GEMINI_API_KEY env", async () => {
    vi.mocked(readAiConfig).mockResolvedValue({} as never);
    process.env.GEMINI_API_KEY = "env-gemini-key";
    expect(await getGeminiImageKey()).toBe("env-gemini-key");
  });

  it("returns null when no key is configured", async () => {
    vi.mocked(readAiConfig).mockResolvedValue({} as never);
    expect(await getGeminiImageKey()).toBe(null);
  });
});

describe("generateImage — input validation", () => {
  it("rejects empty prompt", async () => {
    await expect(generateImage({ prompt: "" })).rejects.toThrow(/required/i);
    await expect(generateImage({ prompt: "   " })).rejects.toThrow(/required/i);
  });

  it("rejects too-long prompt", async () => {
    const long = "a".repeat(4001);
    await expect(generateImage({ prompt: long })).rejects.toThrow(/too long/i);
  });

  it("throws clear error when no API key configured", async () => {
    vi.mocked(readAiConfig).mockResolvedValue({} as never);
    await expect(generateImage({ prompt: "a duck" })).rejects.toThrow(/api key/i);
  });
});

describe("generateImage — happy path", () => {
  it("returns parsed image bytes from camelCase response", async () => {
    const fetchMock = vi.fn(async () =>
      makeOkResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: "Here you go" },
                { inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } },
              ],
            },
          },
        ],
      }),
    );
    const result = await generateImage({ prompt: "a calm lake at dawn", fetchImpl: fetchMock as never });
    expect(result.mimeType).toBe("image/png");
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.provider).toMatch(/gemini-(2\.5-flash|3-pro)-image/);
    expect(result.costUsd).toBe(NANO_BANANA_COST_PER_IMAGE_USD);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("generativelanguage.googleapis.com");
    expect(String(call[0])).toContain("test-key-from-config");
    const body = JSON.parse(call[1].body as string);
    expect(body.contents[0].parts[0].text).toBe("a calm lake at dawn");
  });

  it("accepts the snake_case inline_data alias", async () => {
    const fetchMock = vi.fn(async () =>
      makeOkResponse({
        candidates: [
          {
            content: {
              parts: [{ inline_data: { mime_type: "image/jpeg", data: TINY_PNG_B64 } }],
            },
          },
        ],
      }),
    );
    const result = await generateImage({ prompt: "test", fetchImpl: fetchMock as never });
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("includes the reference image as a second part when provided", async () => {
    const fetchMock = vi.fn(async () =>
      makeOkResponse({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } }] } }],
      }),
    );
    const refBuf = Buffer.from(TINY_PNG_B64, "base64");
    await generateImage({
      prompt: "remix this",
      referenceImage: { buffer: refBuf, mimeType: "image/png" },
      fetchImpl: fetchMock as never,
    });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/png");
    expect(body.contents[0].parts[1].inlineData.data).toBe(TINY_PNG_B64);
  });
});

describe("generateImage — error paths", () => {
  it("throws on non-OK HTTP status", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("upstream blew up", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
    );
    await expect(generateImage({ prompt: "test", fetchImpl: fetchMock as never })).rejects.toThrow(/HTTP 500/);
  });

  it("throws when prompt was blocked by safety filters", async () => {
    const fetchMock = vi.fn(async () =>
      makeOkResponse({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] }),
    );
    await expect(generateImage({ prompt: "blocked", fetchImpl: fetchMock as never })).rejects.toThrow(/SAFETY/);
  });

  it("throws when response has no inline image data", async () => {
    const fetchMock = vi.fn(async () =>
      makeOkResponse({
        candidates: [{ content: { parts: [{ text: "I refuse" }] } }],
      }),
    );
    await expect(generateImage({ prompt: "test", fetchImpl: fetchMock as never })).rejects.toThrow(/no inline image data/);
  });
});
