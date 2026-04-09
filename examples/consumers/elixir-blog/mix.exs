defmodule WebhouseBlog.MixProject do
  use Mix.Project

  def project do
    [
      app: :webhouse_blog,
      version: "0.1.0",
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {WebhouseBlog.Application, []}
    ]
  end

  defp deps do
    [
      {:plug, "~> 1.16"},
      {:bandit, "~> 1.5"},
      {:earmark, "~> 1.4"},
      {:jason, "~> 1.4"}
    ]
  end
end
