import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("system-prompt template safety", () => {
  it("should not contain unescaped backticks inside template literal", () => {
    // Read the source file and check for dangerous patterns
    // An unescaped backtick inside a template literal creates a nested
    // template expression that evaluates variables at runtime.
    // This caused "uploads is not defined" crash (2026-03-27).
    const source = readFileSync(
      join(__dirname, "..", "chat", "system-prompt.ts"),
      "utf-8"
    );

    // Find the return `...` template literal in buildChatSystemPrompt
    const returnMatch = source.match(/return `([\s\S]*?)`;?\s*\}/);
    expect(returnMatch).toBeTruthy();

    const templateBody = returnMatch![1];

    // Check for backticks that aren't escaped (\`) and aren't ${} expressions
    // A bare backtick inside the template literal is ALWAYS a bug
    const lines = templateBody.split("\n");
    const badLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Find backticks that are not escaped (\`) and not part of ${...}
      // Remove escaped backticks and ${...} expressions first
      const cleaned = line.replace(/\\`/g, "").replace(/\$\{[^}]*\}/g, "");
      if (cleaned.includes("`")) {
        badLines.push(`Line ${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    }

    expect(badLines).toEqual([]);
  });
});
