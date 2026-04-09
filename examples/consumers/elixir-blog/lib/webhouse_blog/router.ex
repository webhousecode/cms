defmodule WebhouseBlog.Router do
  use Plug.Router

  alias WebhouseBlog.Webhouse

  plug(Plug.Static, at: "/uploads", from: "priv/static/uploads")
  plug(:match)
  plug(:dispatch)

  # ── Health check (HEAD) — CMS admin sends HEAD to verify site is up ──
  head "/" do
    send_resp(conn, 200, "")
  end

  head "/da/" do
    send_resp(conn, 200, "")
  end

  # ── Routes ──────────────────────────────────────────────

  get "/" do
    posts = Webhouse.collection("posts", "en")
    send_html(conn, render(:home, %{posts: posts, locale: "en"}))
  end

  get "/da/" do
    posts = Webhouse.collection("posts", "da")
    send_html(conn, render(:home, %{posts: posts, locale: "da"}))
  end

  get "/blog/:slug" do
    try do
      case Webhouse.document("posts", slug) do
        nil ->
          send_html(conn, render(:error, %{status_code: 404, status_text: "Post not found"}), 404)

        post ->
          translation = Webhouse.find_translation(post, "posts")
          content_html = Earmark.as_html!(Webhouse.string(post, "content"))

          send_html(
            conn,
            render(:post, %{post: post, translation: translation, content_html: content_html})
          )
      end
    rescue
      Webhouse.InvalidName ->
        send_html(conn, render(:error, %{status_code: 400, status_text: "Invalid slug"}), 400)
    end
  end

  match _ do
    send_html(conn, render(:error, %{status_code: 404, status_text: "Not found"}), 404)
  end

  # ── Helpers ─────────────────────────────────────────────

  defp send_html(conn, body, status \\ 200) do
    conn
    |> Plug.Conn.put_resp_content_type("text/html")
    |> Plug.Conn.send_resp(status, body)
  end

  defp render(template, assigns) do
    globals = Webhouse.globals()
    brand_prefix = Webhouse.string(globals, "brandPrefix", "@webhouse/cms")
    brand_suffix = Webhouse.string(globals, "brandSuffix", "Elixir · Plug")
    footer_text = Webhouse.string(globals, "footerText", "Powered by @webhouse/cms")

    body =
      case template do
        :home -> render_home(assigns)
        :post -> render_post(assigns)
        :error -> render_error(assigns)
      end

    """
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>#{brand_prefix} · #{brand_suffix}</title>
      #{styles()}
    </head>
    <body>
      <nav>
        <a href="/" class="brand">#{brand_prefix} · #{brand_suffix}</a>
        <div><a href="/">EN</a><a href="/da/">DA</a></div>
      </nav>
      #{body}
      <footer>#{footer_text}</footer>
    </body>
    </html>
    """
  end

  defp render_home(%{posts: posts, locale: locale}) do
    rows =
      Enum.map_join(posts, "", fn post ->
        """
        <a href="/blog/#{Map.get(post, "slug")}" class="post-card">
          <div class="meta">
            <span>#{Webhouse.string(post, "date")}</span> · <span>#{Map.get(post, "locale", "")}</span>
          </div>
          <h3>#{html_escape(Webhouse.string(post, "title"))}</h3>
          <p>#{html_escape(Webhouse.string(post, "excerpt"))}</p>
        </a>
        """
      end)

    """
    <h1>Blog</h1>
    <p class="lead">Content read from @webhouse/cms JSON files by an Elixir / Plug / Bandit app (locale: #{locale}).</p>
    #{rows}
    """
  end

  defp render_post(%{post: post, translation: translation, content_html: content_html}) do
    trans_html =
      case translation do
        nil ->
          ""

        t ->
          """
          <div class="translation">
            This post is also available in #{Map.get(t, "locale", "")}:
            <a href="/blog/#{Map.get(t, "slug")}">#{html_escape(Webhouse.string(t, "title"))}</a>
          </div>
          """
      end

    """
    <article>
      <h1>#{html_escape(Webhouse.string(post, "title"))}</h1>
      <div class="meta">
        <span>#{Webhouse.string(post, "author", "Unknown")}</span> ·
        <span>#{Webhouse.string(post, "date")}</span> ·
        <span>#{Map.get(post, "locale", "")}</span>
      </div>
      #{content_html}
      #{trans_html}
      <p><a href="/" class="back">← Back to all posts</a></p>
    </article>
    """
  end

  defp render_error(%{status_code: code, status_text: text}) do
    """
    <div style="text-align: center; padding: 4rem 0;">
      <h1 style="font-size: 5rem; color: var(--gold); font-family: monospace;">#{code}</h1>
      <h2 style="margin-top: 1rem;">#{text}</h2>
      <p style="margin-top: 2rem;"><a href="/" class="back">← Back to all posts</a></p>
    </div>
    """
  end

  defp html_escape(s) when is_binary(s) do
    s
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
  end

  defp html_escape(_), do: ""

  defp styles do
    """
    <style>
      :root { --gold: #F7BB2E; --dark: #0D0D0D; --text: #e8e8e8; --text-dim: #888; --border: #222; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: var(--dark); color: var(--text); line-height: 1.7; max-width: 740px; margin: 0 auto; padding: 3rem 2rem; }
      nav { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2rem; border-bottom: 1px solid var(--border); margin-bottom: 3rem; }
      nav .brand { font-family: 'JetBrains Mono', monospace; color: var(--gold); font-weight: 600; text-decoration: none; }
      nav a { color: var(--text-dim); text-decoration: none; margin-left: 1.5rem; font-size: 0.85rem; }
      nav a:hover { color: var(--gold); }
      h1 { font-size: 2.5rem; color: #fff; margin-bottom: 0.5rem; line-height: 1.15; }
      h2 { font-size: 1.4rem; color: #fff; margin: 2rem 0 1rem; }
      h3 { color: #fff; margin: 0; font-size: 1.2rem; }
      p { margin-bottom: 1rem; color: #ccc; }
      a { color: var(--gold); }
      .lead { color: var(--text-dim); margin-bottom: 3rem; font-size: 1rem; }
      .meta { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 0.5rem; font-family: 'JetBrains Mono', monospace; }
      .post-card { display: block; padding: 1.5rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; text-decoration: none; transition: border-color 0.2s; }
      .post-card:hover { border-color: var(--gold); }
      .post-card .meta { color: #555; font-size: 0.75rem; margin-bottom: 0.5rem; }
      .post-card p { color: var(--text-dim); font-size: 0.9rem; margin: 0.4rem 0 0; }
      article p { color: #ccc; }
      pre { background: #111; padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 1rem 0; border: 1px solid var(--border); }
      code { font-family: monospace; background: rgba(247,187,46,0.1); color: var(--gold); padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
      pre code { padding: 0; background: transparent; color: var(--text); }
      .translation { margin-top: 3rem; padding: 1rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text-dim); }
      .back { display: inline-block; margin-top: 2rem; font-family: monospace; font-size: 0.85rem; }
      footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.8rem; text-align: center; }
    </style>
    """
  end
end
