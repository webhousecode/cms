# Module 22 — Headless Site API & Chat Embedding

Use CMS Admin as a headless backend for your own Next.js (or any) site.
Authenticate with a permanent `wh_` Access Token — no OAuth, no redirects.

**When to fetch this module:**
- Building admin UI inside a site (not using the default `/admin`)
- Embedding the AI chat in a site's own design
- Reading/writing CMS content from server components or API routes
- Building form inboxes, deploy buttons, or analytics inside a site

---

## 1. Create an Access Token

In CMS Admin → Account Preferences → **Access Tokens** → Create custom token.

Choose only the permissions your site needs:

| Use case | Permissions |
|---|---|
| Read content | `content.read` |
| Full content CRUD | `content.read content.create content.edit content.publish content.delete` |
| Trigger deploys | `deploy:trigger deploy:read` |
| Form inbox | `forms.read` |
| All of the above | select all relevant |

Set **Site scope** to restrict the token to a specific site.

Store the token in your `.env`:
```
CMS_API_TOKEN=wh_xxxxxxxxxxxxxxxxxxxx
CMS_API_URL=https://webhouse.app   # or http://localhost:3010
```

**Never expose the token in client-side code.** Use it in server components,
API routes, or `getServerSideProps` only.

---

## 2. Read Content (Server Component)

```typescript
// app/posts/page.tsx
export default async function PostsPage() {
  const res = await fetch(
    `${process.env.CMS_API_URL}/api/cms/posts?status=published`,
    {
      headers: { Authorization: `Bearer ${process.env.CMS_API_TOKEN}` },
      next: { revalidate: 60 },  // ISR: refresh every 60s
    }
  );
  const { documents } = await res.json();

  return (
    <ul>
      {documents.map((post: any) => (
        <li key={post.slug}>{post.data.title}</li>
      ))}
    </ul>
  );
}
```

---

## 3. Full Content API Reference

All endpoints require `Authorization: Bearer wh_xxx`.

```
GET    /api/cms/{collection}              List documents
GET    /api/cms/{collection}/{slug}       Get by slug
POST   /api/cms/{collection}             Create document
PUT    /api/cms/{collection}/{id}        Full replace
PATCH  /api/cms/{collection}/{slug}      Partial update
DELETE /api/cms/{collection}/{id}        Trash

Query params (GET list):
  status    published | draft | all  (default: published)
  locale    en | da | ...
  limit     integer
  offset    integer
  tags      comma-separated
```

**POST body:**
```json
{
  "slug": "my-new-post",
  "status": "draft",
  "data": {
    "title": "My Post",
    "content": "# Hello\n\nWorld."
  }
}
```

---

## 4. Site Admin Building Blocks

### Trigger a deploy
```typescript
await fetch(`${process.env.CMS_API_URL}/api/admin/deploy`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CMS_API_TOKEN}` },
});
```

### Read form submissions
```typescript
const res = await fetch(
  `${process.env.CMS_API_URL}/api/admin/forms/contact/submissions`,
  { headers: { Authorization: `Bearer ${process.env.CMS_API_TOKEN}` } }
);
const { submissions } = await res.json();
```

### Upload media
```typescript
const form = new FormData();
form.append("file", file);
const res = await fetch(
  `${process.env.CMS_API_URL}/api/admin/media/upload`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CMS_API_TOKEN}` },
    body: form,
  }
);
const { url } = await res.json();
```

---

## 5. Embed the AI Chat

The CMS chat runs the same Claude model and tool set as the Admin UI.
You can surface it in your own design by proxying the streaming endpoint.

### 5a. Server-side proxy route (Next.js)

```typescript
// app/api/chat/route.ts
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.text();

  const upstream = await fetch(
    `${process.env.CMS_API_URL}/api/cms/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CMS_API_TOKEN}`,
        // Forward site context so the chat knows which site it's on
        Cookie: `cms-active-site=${process.env.CMS_SITE_ID}`,
      },
      body,
    }
  );

  // Stream the SSE response back to the browser
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
```

### 5b. Client component — minimal chat

```typescript
"use client";
import { useState } from "react";

export function SiteChat() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");

  async function send() {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...messages, userMsg] }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (const line of buf.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const d = JSON.parse(line.slice(6));
            if (d.text) {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1].content += d.text;
                return next;
              });
            }
          } catch { /* skip */ }
        }
      }
      buf = buf.split("\n").pop() ?? "";
    }
  }

  return (
    <div className="chat">
      {messages.map((m, i) => (
        <div key={i} className={m.role}>
          <p>{m.content}</p>
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()} />
      <button onClick={send}>Send</button>
    </div>
  );
}
```

### Restrict chat tools via token permissions

The chat only runs tools that match the token's permissions. To prevent
the site chat from, say, trashing documents — don't include
`content.delete` on the token.

---

## 6. ICD Revalidation (ISR)

If your site uses Instant Content Deployment, configure the revalidate
webhook in Site Settings → Deploy → Revalidate URL. When content is
published in CMS Admin, the webhook fires and Next.js revalidates the
affected paths automatically.

```typescript
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhouse-secret");
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }
  const { slug, collection } = await req.json();
  revalidatePath(`/${collection}/${slug}`);
  return NextResponse.json({ revalidated: true });
}
```

---

## 7. Quick decisions

- **"Read content in server component"** → Section 2
- **"Build a custom admin panel in my site"** → Sections 3 + 4
- **"Embed AI chat"** → Section 5
- **"Connect ICD/ISR"** → Section 6
- **"What permissions does my token need?"** → Section 1 table
