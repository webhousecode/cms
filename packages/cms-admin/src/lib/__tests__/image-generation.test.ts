/**
 * Gemini Nano Banana image generation tests.
 *
 * Unit tests against the central @broberg/ai-sdk facade — `ai.image()` is
 * mocked via the getAI() helper. Covers key resolution, prompt validation,
 * the data-URL → bytes decode, the cost stamp, and error propagation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-config", () => ({
  readAiConfig: vi.fn(async () => ({ geminiApiKey: "test-key-from-config" })),
}));

const imageMock = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  getAI: vi.fn(async () => ({ image: imageMock })),
}));

import { generateImage, getGeminiImageKey, NANO_BANANA_COST_PER_IMAGE_USD } from "../ai/image-generation";
import { readAiConfig } from "@/lib/ai-config";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Z+0bMwAAAAASUVORK5CYII=";

function imageResult(mime: string, costUsd = NANO_BANANA_COST_PER_IMAGE_USD) {
  return { url: `data:${mime};base64,${TINY_PNG_B64}`, usage: { costUsd } as never };
}

beforeEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  vi.mocked(readAiConfig).mockResolvedValue({ geminiApiKey: "test-key-from-config" } as never);
  imageMock.mockReset();
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
  it("decodes the data-URL from ai.image into bytes + mime", async () => {
    imageMock.mockResolvedValue(imageResult("image/png"));
    const result = await generateImage({ prompt: "a calm lake at dawn" });
    expect(result.mimeType).toBe("image/png");
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.provider).toMatch(/gemini-(2\.5-flash|3-pro)-image/);
    expect(result.costUsd).toBe(NANO_BANANA_COST_PER_IMAGE_USD);
    expect(imageMock).toHaveBeenCalledOnce();
    const arg = imageMock.mock.calls[0][0] as { prompt: string; override: { provider: string } };
    expect(arg.prompt).toBe("a calm lake at dawn");
    expect(arg.override.provider).toBe("gemini");
  });

  it("passes through a jpeg mime", async () => {
    imageMock.mockResolvedValue(imageResult("image/jpeg"));
    const result = await generateImage({ prompt: "test" });
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("falls back to the snapshot cost when usage.costUsd is 0", async () => {
    imageMock.mockResolvedValue(imageResult("image/png", 0));
    const result = await generateImage({ prompt: "test" });
    expect(result.costUsd).toBe(NANO_BANANA_COST_PER_IMAGE_USD);
  });
});

describe("generateImage — error paths", () => {
  it("propagates errors thrown by ai.image", async () => {
    imageMock.mockRejectedValue(new Error("upstream blew up"));
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(/upstream blew up/);
  });

  it("throws when ai.image returns a non data-URL", async () => {
    imageMock.mockResolvedValue({ url: "https://hosted.example/x.png", usage: { costUsd: 0.039 } as never });
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(/inline image/i);
  });
});
