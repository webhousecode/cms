# @webhouse/cms

The AI-native content engine. **Framework-agnostic file-based JSON content** with a TypeScript admin, AI agents, workflows, and a static build pipeline. Your content as flat JSON — render it with Next.js, Laravel, Django, Spring Boot, .NET, Rails, Hugo, or anything that reads files.

> **Reader libraries planned for Phase 2:** PHP (Packagist), Python (PyPI), Ruby (RubyGems), Go (pkg.go.dev), Java (Maven Central), C#/.NET (NuGet). See `examples/consumers/` for reference implementations in Java (Spring Boot) and .NET (Razor Pages).

## Installation

```bash
npm install @webhouse/cms
```

## Usage

```typescript
import { defineSite, defineCollection, z } from "@webhouse/cms";

const site = defineSite({
  name: "My Site",
  collections: [
    defineCollection({
      name: "posts",
      schema: {
        title: z.string(),
        body: z.string(),
        publishedAt: z.string().datetime(),
      },
    }),
  ],
});
```

## Getting Started

The fastest way to get started is with the CLI:

```bash
npx @webhouse/cms init
```

## Documentation

See the [main repository](https://github.com/webhousecode/cms) for full documentation.

## License

MIT
