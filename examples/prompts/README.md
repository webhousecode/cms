# Sample AI Builder Prompts

Prompts designed to be pasted into an AI coding assistant (Claude Code, Cursor, Copilot, Gemini, Windsurf) to build a complete site with `@webhouse/cms` from scratch — no template, no boilerplate.

Every prompt starts by pointing the AI at https://ai.webhouse.app (the AI Builder Site) and lets its Step 0–9 walkthrough drive the build.

| Prompt | Stack | Design brief |
|--------|-------|--------------|
| [miles-davis.md](./miles-davis.md) | Bun + Vite + Preact + Tailwind v4 | Dark Blue Note aesthetic — albums, eras, quotes |

## How to use

```bash
# Copy any .md file to the clipboard and paste it into your AI session
cat examples/prompts/miles-davis.md | pbcopy     # macOS
cat examples/prompts/miles-davis.md | xclip -selection clipboard   # Linux
```

Or just paste the file contents directly into the chat.
