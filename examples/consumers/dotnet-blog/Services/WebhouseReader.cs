using System.Text.Json;
using System.Text.RegularExpressions;

namespace DotnetBlog.Services;

/// <summary>
/// F125 Phase 1 — .NET reader for @webhouse/cms file-based content.
///
/// Reads JSON documents from <c>content/{collection}/</c> and exposes them as
/// <see cref="WebhouseDocument"/> instances. Designed to be thin, dependency-light
/// (uses only System.Text.Json), and safe — slugs and collection names are
/// validated against <see cref="SafeName"/> to prevent path traversal.
///
/// Reference implementation for the future <c>Webhouse.Cms.Reader</c> NuGet package.
/// </summary>
public sealed class WebhouseReader
{
    /// <summary>Allowed pattern for collection names and slugs.</summary>
    private static readonly Regex SafeName = new("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", RegexOptions.Compiled);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly string _contentDir;

    public WebhouseReader(string contentDir)
    {
        _contentDir = Path.GetFullPath(contentDir);
    }

    /// <summary>
    /// List all published documents in a collection, optionally filtered by locale.
    /// Returned documents are sorted by data.date descending (newest first).
    /// </summary>
    public IReadOnlyList<WebhouseDocument> Collection(string collection, string? locale = null)
    {
        ValidateName(collection);
        var dir = Path.Combine(_contentDir, collection);
        if (!Directory.Exists(dir)) return Array.Empty<WebhouseDocument>();

        var docs = new List<WebhouseDocument>();
        foreach (var file in Directory.EnumerateFiles(dir, "*.json"))
        {
            try
            {
                var doc = JsonSerializer.Deserialize<WebhouseDocument>(File.ReadAllText(file), JsonOptions);
                if (doc is null || !doc.IsPublished) continue;
                if (locale != null && doc.Locale != locale) continue;
                docs.Add(doc);
            }
            catch (JsonException)
            {
                // Skip malformed files rather than crash the whole listing.
            }
        }

        return docs
            .OrderByDescending(d => d.GetStringOr("date", string.Empty), StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Load a single published document by collection and slug.
    /// Returns null if not found, malformed, or unpublished.
    /// </summary>
    public WebhouseDocument? Document(string collection, string slug)
    {
        ValidateName(collection);
        ValidateName(slug);
        var path = Path.GetFullPath(Path.Combine(_contentDir, collection, $"{slug}.json"));
        if (!path.StartsWith(_contentDir, StringComparison.Ordinal) || !File.Exists(path))
            return null;

        try
        {
            var doc = JsonSerializer.Deserialize<WebhouseDocument>(File.ReadAllText(path), JsonOptions);
            return doc?.IsPublished == true ? doc : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Find the sibling translation of a document via its translationGroup.
    /// </summary>
    public WebhouseDocument? FindTranslation(WebhouseDocument doc, string collection)
    {
        if (string.IsNullOrEmpty(doc.TranslationGroup)) return null;
        return Collection(collection)
            .FirstOrDefault(other =>
                other.TranslationGroup == doc.TranslationGroup &&
                other.Locale != doc.Locale);
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrEmpty(name) || !SafeName.IsMatch(name))
            throw new ArgumentException($"Invalid name '{name}' — must match {SafeName}", nameof(name));
    }
}
