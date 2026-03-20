# F90 — Marketing Content Bank

> Living document of messaging, value propositions, and talking points for the GitHub README, webhouse.app website, social media, and documentation.

## Problem

We have 89 features planned but no centralized place for marketing messaging. Every time we write README copy, landing page text, or tweets, we start from scratch. Talking points get lost in Slack/Discord/conversations.

## Solution

A single living document that grows with the product. Not code — content. Every team member (human or AI) adds entries as ideas come up. Entries cover: headlines, long copy, talking points, one-liners, honest limitations, migration guides, badges. This is the source of truth for how we talk about the product.

---

## 1. Run Locally, Deploy Globally

### Headline
**Your CMS runs on your machine. Your sites run on the world's servers.**

### Key message
You can clone the entire @webhouse/cms repo and run the full CMS admin on your local machine at `localhost:3010`. All your content management — editing, AI generation, media uploads, agent scheduling, curation — happens locally on your PC or Mac. Your live sites deploy to real servers (Vercel, Fly.io, GitHub Pages, Netlify, or any host you choose), but the CMS itself is yours to run wherever you want.

### Long copy (for README / landing page)

```
## Run locally, deploy globally

webhouse.app runs entirely on your machine. Clone the repo, start the admin,
and manage all your sites from localhost:3010 — no cloud account required.

    git clone https://github.com/webhousecode/cms.git
    cd cms && pnpm install
    cd packages/cms-admin && pnpm dev

Your CMS is now running. Create sites, write content, generate AI articles,
manage media, schedule publishing — all from your local machine.

When you're ready to go live, your sites deploy to real servers:

  • Vercel — zero-config Next.js deploy
  • Fly.io — Docker containers in Stockholm (arn)
  • GitHub Pages — free static hosting from your repo
  • Netlify — drag-and-drop or git-based deploy
  • Any server — cms build outputs static files you can host anywhere

The CMS stays local. The sites go global.
```

### Talking points
- **Zero cloud dependency for content management** — no SaaS account, no monthly fee, no vendor lock-in for the CMS itself
- **Full admin UI locally** — not a stripped-down CLI, the actual visual admin with richtext editor, media library, AI agents, curation queue
- **GitHub adapter for remote sites** — manage a GitHub-backed site from your local CMS, changes push via GitHub API
- **Filesystem adapter for local sites** — content is just JSON files on disk, use any tool to inspect or modify
- **Works offline** — content editing works without internet (filesystem adapter), only AI features and GitHub sync need connectivity

### What you CAN'T do locally (be honest)
- AI features require API keys (Anthropic/OpenAI) — the AI itself runs in the cloud
- GitHub-backed sites need a GitHub token for read/write
- Scheduled publishing via external heartbeat (F60) needs the machine to be running
- Email sending (newsletters, invitations) requires ESP credentials (Resend/SES)
- MCP servers that connect to external services need those services to be reachable

### Migration: Local → Hosted Hub

```
## Moving to webhouse.app (hosted)

Started locally and ready for a team? Migrate to the hosted hub in 3 steps:

1. Sign up at https://webhouse.app
2. Connect your GitHub account
3. Import your sites — the hub reads your existing registry.json

Your content, media, agents, and settings transfer automatically.
The hosted version adds: team access from anywhere, automatic backups,
SSL, custom domains, and zero-maintenance updates.

Alternatively, self-host on Fly.io ($3-5/month):

    fly launch --image webhousecode/cms-admin
    fly volumes create cms_data --region arn --size 1

Same CMS, your own infrastructure, your own data.
```

### Short versions (for tweets / badges / one-liners)

- "Clone. Run. Manage content. Deploy sites. All from localhost."
- "The CMS that runs on your machine, deploys to the world."
- "No SaaS required. Your content, your machine, your rules."
- "localhost:3010 → manage all your sites → deploy anywhere"
- "AI-native CMS you can run in your terminal"

---

## 2. AI-Native, Not AI-Bolted-On

### Headline
**AI isn't a feature. It's the foundation.**

### Key message
Most CMS platforms bolt AI on as an afterthought — a "generate" button next to a text field. In webhouse.app, AI is the architecture. Every piece of content can be AI-generated, AI-reviewed, or AI-optimized. Agents run on schedules. A curation queue gives humans final say. The CMS was built for AI from day one.

### Talking points
- **AI agents, not AI buttons** — agents run autonomously on schedules, generate content, optimize SEO, check links
- **Curation queue** — AI generates, humans approve. One-click approve or reject with feedback
- **AI Lock** — fields edited by humans are automatically protected from AI overwrite
- **Brand voice** — AI learns your tone, vocabulary, and style through brand voice interviews
- **Multi-model** — Claude, GPT-4, or both in parallel for comparison
- **Cost tracking** — real-time budget monitoring, monthly limits, per-agent cost tracking
- **MCP integration** — AI agents can access content via MCP protocol, enabling external AI tools to work with your CMS

---

## 3. Content-First Commerce (for F68 Shop Plugin)

### Headline
**A CMS with a shop, not a shop with a CMS.**

### Key message
Unlike Shopify or WooCommerce where content is an afterthought, webhouse.app is a content platform that happens to sell things. Your blog, guides, and courses are the primary value. Commerce is the monetization layer. AI writes product descriptions, generates SEO, and can even recommend products in chat.

---

## 4. Open Source, Own Your Data

### Headline
**Your content. Your database. Your server. Your code.**

### Key message
webhouse.app is MIT-licensed open source. Content is stored as JSON files — no proprietary database, no lock-in. Export everything anytime. Self-host or use our managed service. Fork it, extend it, build on it. The only CMS where switching away means copying a folder.

### Talking points
- **Content is JSON files** — readable, portable, version-controlled
- **No proprietary database** — SQLite or filesystem, both open standards
- **MIT license** — use commercially, modify freely, no attribution required
- **Export = copy a folder** — `content/` directory is the entire CMS dataset
- **GitHub as storage** — your content lives in your own GitHub repo

---

## 5. 80+ Features Planned (for credibility / roadmap page)

### Headline
**F01 to F89. We know where we're going.**

### Key message
Every feature has an F-number, a plan document with technical design, implementation steps, and impact analysis. We don't just dream features — we spec them like a senior engineering team. Check the roadmap: `docs/ROADMAP.md`.

---

## Badge / Shield ideas (for README)

```markdown
![Features](https://img.shields.io/badge/features-89%20planned-F7BB2E)
![AI Agents](https://img.shields.io/badge/AI%20agents-built%20in-F7BB2E)
![License](https://img.shields.io/badge/license-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
```

---

## Deploy targets (for README / docs)

| Target | Method | Cost | Best for |
|--------|--------|------|----------|
| **Vercel** | `vercel --prod` or git push | Free tier available | Next.js sites |
| **Fly.io** | `fly deploy` (Docker) | ~$3-5/mo (arn region) | Self-hosted CMS admin |
| **GitHub Pages** | `cms build` → push to gh-pages | Free | Static sites |
| **Netlify** | Git-based or drag-drop | Free tier available | Static sites |
| **Docker** | `docker run webhousecode/cms-admin` | Self-hosted | On-premise / VPS |
| **Any static host** | `cms build && cms serve` or copy `dist/` | Varies | Maximum flexibility |

---

*Add new entries below as ideas come up. This document grows with the product.*
