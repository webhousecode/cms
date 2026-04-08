package app.webhouse.cmsreader;

import org.springframework.stereotype.Component;

/**
 * Convenience wrapper around the globals collection.
 *
 * In the F125 universal-content-platform pattern, "globals" is a single-record
 * collection that holds site-wide settings (brand text, footer, social links).
 * This bean loads that record on first access and exposes typed accessors.
 *
 * Available in every Thymeleaf template as ${globals} via {@link GlobalsAdvice}.
 */
@Component
public class WebhouseGlobals {

    private final WebhouseReader reader;
    private WebhouseDocument cached;

    public WebhouseGlobals(WebhouseReader reader) {
        this.reader = reader;
    }

    public WebhouseDocument getSite() {
        if (cached == null) {
            cached = reader.document("globals", "site").orElse(null);
        }
        return cached;
    }

    public String getBrandPrefix() {
        WebhouseDocument site = getSite();
        return site != null ? site.getStringOr("brandPrefix", "@webhouse/cms") : "@webhouse/cms";
    }

    public String getBrandSuffix() {
        WebhouseDocument site = getSite();
        return site != null ? site.getStringOr("brandSuffix", "") : "";
    }

    public String getFooterText() {
        WebhouseDocument site = getSite();
        return site != null
            ? site.getStringOr("footerText", "Powered by @webhouse/cms")
            : "Powered by @webhouse/cms";
    }
}
