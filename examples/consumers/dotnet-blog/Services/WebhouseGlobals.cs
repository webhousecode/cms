namespace DotnetBlog.Services;

/// <summary>
/// Convenience wrapper around the globals collection.
///
/// In the F125 universal-content-platform pattern, "globals" is a single-record
/// collection that holds site-wide settings (brand text, footer, social links).
/// This service loads that record once and exposes typed accessors.
/// </summary>
public sealed class WebhouseGlobals
{
    private readonly WebhouseReader _reader;
    private WebhouseDocument? _cached;

    public WebhouseGlobals(WebhouseReader reader)
    {
        _reader = reader;
    }

    /// <summary>
    /// Load the globals/site.json document. Cached after first call.
    /// In production with a webhook for content changes, you'd invalidate
    /// _cached on save instead of always returning the same instance.
    /// </summary>
    public WebhouseDocument? Site
    {
        get
        {
            _cached ??= _reader.Document("globals", "site");
            return _cached;
        }
    }

    public string BrandPrefix => Site?.GetStringOr("brandPrefix", "@webhouse/cms") ?? "@webhouse/cms";
    public string BrandSuffix => Site?.GetStringOr("brandSuffix", "") ?? "";
    public string FooterText => Site?.GetStringOr("footerText", "Powered by @webhouse/cms") ?? "Powered by @webhouse/cms";
}
