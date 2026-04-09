defmodule WebhouseBlog.Webhouse do
  @moduledoc """
  F125 reference reader for @webhouse/cms file-based content (Elixir).

  Reads JSON documents from `content/{collection}/` directories. Designed to
  be thin (Jason for JSON parsing) and safe — slugs and collection names are
  validated against `@safe_name` to prevent path traversal.

  Drop into a Phoenix controller and the API is identical — Plug and Phoenix
  share the same Conn pipeline.
  """

  @safe_name ~r/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

  defmodule InvalidName do
    defexception [:name]
    def message(%{name: name}), do: "invalid name '#{name}'"
  end

  def content_dir do
    Path.join([File.cwd!(), "content"])
  end

  defp validate!(name) when is_binary(name) do
    unless Regex.match?(@safe_name, name) do
      raise InvalidName, name: name
    end
  end

  defp validate!(_), do: raise(InvalidName, name: "non-string")

  @doc "List published documents in a collection. Pass locale as nil for all."
  def collection(name, locale \\ nil) do
    validate!(name)
    dir = Path.join(content_dir(), name)

    case File.ls(dir) do
      {:ok, entries} ->
        entries
        |> Enum.filter(&String.ends_with?(&1, ".json"))
        |> Enum.map(fn file ->
          case File.read(Path.join(dir, file)) do
            {:ok, raw} ->
              case Jason.decode(raw) do
                {:ok, doc} -> doc
                _ -> nil
              end

            _ ->
              nil
          end
        end)
        |> Enum.reject(&is_nil/1)
        |> Enum.filter(&(Map.get(&1, "status") == "published"))
        |> Enum.filter(fn doc ->
          locale == nil or Map.get(doc, "locale") == locale
        end)
        |> Enum.sort_by(fn doc -> get_in(doc, ["data", "date"]) || "" end, :desc)

      _ ->
        []
    end
  end

  @doc "Load a single published document by collection + slug, or nil."
  def document(collection, slug) do
    validate!(collection)
    validate!(slug)

    path = Path.join([content_dir(), collection, "#{slug}.json"])
    abs = Path.expand(path)

    if not String.starts_with?(abs, content_dir()) do
      nil
    else
      case File.read(abs) do
        {:ok, raw} ->
          case Jason.decode(raw) do
            {:ok, doc} ->
              if Map.get(doc, "status") == "published", do: doc, else: nil

            _ ->
              nil
          end

        _ ->
          nil
      end
    end
  end

  @doc "Find the sibling translation of a document via translationGroup."
  def find_translation(doc, collection) do
    case Map.get(doc, "translationGroup") do
      nil ->
        nil

      tg ->
        Enum.find(collection(collection), fn other ->
          Map.get(other, "translationGroup") == tg and
            Map.get(other, "locale") != Map.get(doc, "locale")
        end)
    end
  end

  @doc "Cached singleton globals/site.json document. Loaded once per request."
  def globals do
    document("globals", "site") || %{"data" => %{}}
  end

  @doc "Safely extract a string field from doc.data."
  def string(doc, key, default \\ "")

  def string(nil, _, default), do: default

  def string(doc, key, default) do
    case get_in(doc, ["data", key]) do
      v when is_binary(v) -> v
      _ -> default
    end
  end
end
