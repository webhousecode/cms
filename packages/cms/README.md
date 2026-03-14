# @webhouse/cms

AI-native CMS engine built on Hono, Drizzle ORM, and SQLite. Define content schemas with Zod, get a full API and static site builder out of the box.

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
