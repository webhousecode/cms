/**
 * Image generation tests — Black Forest Labs FLUX 2 on the EU route (F201.7).
 *
 * Unit tests against the central @broberg/ai-sdk facade — `ai.image()` is
 * mocked via the getAI() helper, and the image download via global fetch.
 * The load-bearing assertions are the residency ones: the call is pinned to
 * the bfl provider, and a response that did not come back from the EU route
 * is refused rather than saved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const imageMock = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  getAI: vi.fn(async () => ({ image: imageMock })),
}));

import { generateImage, getImageGenerationKey } from "../ai/image-generation";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAMPLE_URL = "https://delivery-eu.bfl.ai/results/abc/sample.jpeg";

function euResult(costUsd = 0.03) {
  return { url: SAMPLE_URL, usage: { provider: "bfl", model: "flux-2-pro", region: "eu", costUsd } as never };
}

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.BFL_API_KEY = "test-bfl-key";
  imageMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(PNG, { status: 200, headers: { "content-type": "image/jpeg" } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.BFL_API_KEY;
  vi.unstubAllGlobals();
});

describe("getImageGenerationKey", () => {
  it("reads BFL_API_KEY", () => {
    expect(getImageGenerationKey()).toBe("test-bfl-key");
  });

  it("returns null when no key is configured (the tool then stays off)", () => {
    delete process.env.BFL_API_KEY;
    expect(getImageGenerationKey()).toBe(null);
  });

  it("does not fall back to a Gemini key — that would leave the EU", () => {
    delete process.env.BFL_API_KEY;
    process.env.GEMINI_API_KEY = "gemini";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google";
    try {
      expect(getImageGenerationKey()).toBe(null);
    } finally {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
  });
});

describe("generateImage — input validation", () => {
  it("rejects empty prompt", async () => {
    await expect(generateImage({ prompt: "" })).rejects.toThrow(/required/i);
    await expect(generateImage({ prompt: "   " })).rejects.toThrow(/required/i);
  });

  it("rejects too-long prompt", async () => {
    await expect(generateImage({ prompt: "a".repeat(4001) })).rejects.toThrow(/too long/i);
  });

  it("throws clear error when no API key configured", async () => {
    delete process.env.BFL_API_KEY;
    await expect(generateImage({ prompt: "a duck" })).rejects.toThrow(/BFL_API_KEY/);
    expect(imageMock).not.toHaveBeenCalled();
  });
});

describe("generateImage — EU route", () => {
  it("pins the call to bfl and never to gemini", async () => {
    imageMock.mockResolvedValue(euResult());
    await generateImage({ prompt: "a calm lake at dawn" });
    const arg = imageMock.mock.calls[0][0] as { prompt: string; override: { provider: string; model: string } };
    expect(arg.prompt).toBe("a calm lake at dawn");
    expect(arg.override.provider).toBe("bfl");
    expect(arg.override.provider).not.toBe("gemini");
    expect(arg.override.model).toMatch(/^flux-2-/);
  });

  it("downloads the result and returns bytes, mime, model and the reported cost", async () => {
    imageMock.mockResolvedValue(euResult(0.045));
    const result = await generateImage({ prompt: "test" });
    expect(fetchMock).toHaveBeenCalledWith(SAMPLE_URL);
    expect(Array.from(result.buffer)).toEqual(Array.from(PNG));
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.provider).toBe("flux-2-pro");
    expect(result.costUsd).toBe(0.045);
  });

  it("refuses a response that did not come back from the EU route", async () => {
    imageMock.mockResolvedValue({ url: SAMPLE_URL, usage: { provider: "gemini", region: "us", costUsd: 0.04 } as never });
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(/EU/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("generateImage — error paths", () => {
  it("propagates errors thrown by ai.image", async () => {
    imageMock.mockRejectedValue(new Error("upstream blew up"));
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(/upstream blew up/);
  });

  it("throws when the image download fails", async () => {
    imageMock.mockResolvedValue(euResult());
    fetchMock.mockResolvedValue(new Response("gone", { status: 404 }));
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(/404/);
  });

  it("throws when the download is not an image", async () => {
    imageMock.mockResolvedValue(euResult());
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(generateImage({ prompt: "test" })).rejects.toThrow(/not an image/i);
  });
});
