/**
 * Security W41 H4 — an uploaded HTML/SVG served from the admin's origin ran
 * its scripts with the admin's cookies. It must arrive sandboxed (opaque origin).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/media", () => ({ getMediaAdapter: async () => ({ readFile: async () => Buffer.from("<svg/>") }) }));

async function get(name: string) {
  const { GET } = await import("../../app/api/uploads/[...path]/route");
  return GET(new NextRequest(`https://webhouse.app/api/uploads/${name}`), { params: Promise.resolve({ path: [name] }) });
}

describe("uploads serving", () => {
  it.each(["x.html", "x.svg", "X.SVG", "x.htm"])("%s arrives sandboxed and nosniff", async (n) => {
    const res = await get(n);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("an image is not sandboxed (it must still embed on customer sites)", async () => {
    const res = await get("photo.jpg");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
