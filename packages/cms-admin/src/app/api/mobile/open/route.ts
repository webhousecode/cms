import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/mobile/open?url=webhouseapp://login?...
 *
 * Minimal HTML page with a single "Open in webhouse.app" button.
 * Safari won't auto-open custom URL schemes from the address bar,
 * but it WILL trigger them from an <a href> link on a page.
 *
 * No auth required — the page itself does nothing except redirect.
 * The deep link URL inside is single-use and time-limited (5min TTL
 * from qr-sessions.ts), so exposing this endpoint publicly is safe.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.startsWith("webhouseapp://")) {
    return NextResponse.json({ error: "Missing or invalid url param" }, { status: 400 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Open in webhouse.app</title>
  <style>
    body { background: #0d0d0d; color: #fff; font-family: -apple-system, system-ui, sans-serif;
           display: flex; flex-direction: column; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 1rem; }
    a { display: block; background: #F7BB2E; color: #0d0d0d; text-decoration: none;
        font-weight: 600; font-size: 1.1rem; padding: 1rem 2rem; border-radius: 12px;
        margin-top: 1.5rem; text-align: center; }
    a:active { transform: scale(0.97); }
    p { color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <img src="/webhouse.app-dark-icon.svg" width="72" height="72" alt="webhouse.app">
  <a href="${url.replace(/"/g, '&quot;')}">Open in webhouse.app</a>
  <p>Tap the button to sign in to the mobile app.</p>
  <script>
    // Auto-attempt the redirect after 500ms
    setTimeout(() => { window.location.href = ${JSON.stringify(url)}; }, 500);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
