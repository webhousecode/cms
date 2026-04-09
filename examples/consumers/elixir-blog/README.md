# elixir-blog — @webhouse/cms consumer example

A minimal Elixir + Plug + Bandit application reading @webhouse/cms JSON content. The `WebhouseBlog.Webhouse` module is **drop-in compatible with Phoenix** — copy it to `lib/my_app/webhouse.ex` and call it from any Phoenix controller.

**Stack:** Elixir 1.15+ · Plug 1.16 · Bandit 1.5 · Earmark for markdown · Jason for JSON

## Why Plug instead of Phoenix?

Faster bring-up (no `mix phx.new`, no Ecto, no asset pipeline). The reader pattern is the focus and it's identical in both. Bandit + Plug is what powers Phoenix's HTTP layer anyway — so this is "Phoenix without the controller framework."

## Quick start

```bash
cd examples/consumers/elixir-blog
mix deps.get
mix run --no-halt
```

Open http://localhost:4000 (EN) or http://localhost:4000/da/ (DA).

## How it works

```
content/                      ← @webhouse/cms JSON files
lib/webhouse_blog/
  application.ex              ← Bandit supervisor
  router.ex                   ← Plug.Router with handlers + inline templates
  webhouse.ex                 ← reader (~110 LOC, stdlib + Jason only)
mix.exs
```

```elixir
alias WebhouseBlog.Webhouse

posts = Webhouse.collection("posts", "en")
post = Webhouse.document("posts", "hello-world")
trans = Webhouse.find_translation(post, "posts")
```

## Phoenix migration

The `Webhouse` module has zero Plug-specific code. To use in a Phoenix app:

1. Copy `lib/webhouse_blog/webhouse.ex` to `lib/my_app/webhouse.ex` (rename module)
2. In any controller:

```elixir
defmodule MyAppWeb.BlogController do
  use MyAppWeb, :controller
  alias MyApp.Webhouse

  def index(conn, _params) do
    posts = Webhouse.collection("posts", "en")
    render(conn, :index, posts: posts)
  end

  def show(conn, %{"slug" => slug}) do
    case Webhouse.document("posts", slug) do
      nil -> conn |> put_status(:not_found) |> render(:not_found)
      post -> render(conn, :show, post: post)
    end
  end
end
```

3. In your Phoenix HEEx templates, use `<%= @post["data"]["title"] %>`.

## Security

`Webhouse.validate!/1` raises `Webhouse.InvalidName` on slugs that don't match `^[a-z0-9][a-z0-9-]*$`. The resolved path is also checked against the content directory prefix.

## Related

- **F125** — Framework-Agnostic Content Platform
