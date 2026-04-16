import { describe, it, expect } from "vitest";
import { cloudflarePagesDeploy } from "../deploy/cloudflare-pages-provider";

describe("cloudflarePagesDeploy — input validation", () => {
  const baseConfig = {
    accountId: "deadbeefdeadbeef",
    apiToken: "fake-token",
  };

  it("rejects invalid project names (uppercase)", async () => {
    await expect(
      cloudflarePagesDeploy({ ...baseConfig, projectName: "MyProject" }, "/tmp/nonexistent"),
    ).rejects.toThrow(/project name.*invalid/i);
  });

  it("rejects invalid project names (underscores)", async () => {
    await expect(
      cloudflarePagesDeploy({ ...baseConfig, projectName: "my_project" }, "/tmp/nonexistent"),
    ).rejects.toThrow(/project name.*invalid/i);
  });

  it("rejects invalid project names (leading hyphen)", async () => {
    await expect(
      cloudflarePagesDeploy({ ...baseConfig, projectName: "-myproject" }, "/tmp/nonexistent"),
    ).rejects.toThrow(/project name.*invalid/i);
  });

  it("rejects overlong project names", async () => {
    await expect(
      cloudflarePagesDeploy({ ...baseConfig, projectName: "a".repeat(60) }, "/tmp/nonexistent"),
    ).rejects.toThrow(/project name.*invalid/i);
  });
});
