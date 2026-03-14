# @webhouse/cms-ai

AI agents for `@webhouse/cms` — generate, rewrite, and optimize content using Anthropic Claude or OpenAI.

## Installation

```bash
npm install @webhouse/cms-ai
```

## Usage

```typescript
import { createAIAgent } from "@webhouse/cms-ai";

const agent = createAIAgent({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const content = await agent.generate({
  collection: "posts",
  prompt: "Write a blog post about TypeScript best practices",
});
```

## Documentation

See the [main repository](https://github.com/webhousecode/cms) for full documentation.

## License

MIT
