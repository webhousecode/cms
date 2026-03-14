# @webhouse/create-cms

Scaffold a new [@webhouse/cms](https://github.com/webhousecode/cms) project in seconds.

## Usage

```bash
npm create @webhouse/cms my-site
```

This creates a new directory with a ready-to-run CMS project.

## What you get

```
my-site/
├── cms.config.ts        # Collection schemas (TypeScript)
├── package.json         # Dependencies pre-configured
├── .env                 # API keys (add your own)
└── content/
    └── posts/
        └── hello-world.json   # Example post
```

## Next steps

```bash
cd my-site
npm install
npx cms dev       # Start dev server
npx cms build     # Build static site
```

## Documentation

See the [main repository](https://github.com/webhousecode/cms) for full documentation.

## License

MIT
