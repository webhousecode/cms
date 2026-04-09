defmodule WebhouseBlog.Application do
  use Application

  @impl true
  def start(_type, _args) do
    port = String.to_integer(System.get_env("PORT") || "4000")

    children = [
      {Bandit, plug: WebhouseBlog.Router, scheme: :http, port: port}
    ]

    opts = [strategy: :one_for_one, name: WebhouseBlog.Supervisor]
    IO.puts("elixir-blog listening on :#{port}")
    Supervisor.start_link(children, opts)
  end
end
