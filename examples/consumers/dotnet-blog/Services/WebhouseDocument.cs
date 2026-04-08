using System.Text.Json;
using System.Text.Json.Serialization;

namespace DotnetBlog.Services;

/// <summary>
/// A single @webhouse/cms document, mirroring the JSON shape.
/// </summary>
public sealed class WebhouseDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("slug")]
    public string Slug { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("locale")]
    public string? Locale { get; set; }

    [JsonPropertyName("translationGroup")]
    public string? TranslationGroup { get; set; }

    [JsonPropertyName("data")]
    public Dictionary<string, JsonElement> Data { get; set; } = new();

    [JsonPropertyName("createdAt")]
    public string? CreatedAt { get; set; }

    [JsonPropertyName("updatedAt")]
    public string? UpdatedAt { get; set; }

    public bool IsPublished => Status == "published";

    /// <summary>Get a string field from data, or null if missing/wrong type.</summary>
    public string? GetString(string key)
    {
        if (!Data.TryGetValue(key, out var value)) return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    /// <summary>Get a string field with a fallback default.</summary>
    public string GetStringOr(string key, string fallback) => GetString(key) ?? fallback;

    /// <summary>Get a string array field (e.g. tags).</summary>
    public IReadOnlyList<string> GetStringArray(string key)
    {
        if (!Data.TryGetValue(key, out var value) || value.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        var result = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
                result.Add(item.GetString()!);
        }
        return result;
    }
}
