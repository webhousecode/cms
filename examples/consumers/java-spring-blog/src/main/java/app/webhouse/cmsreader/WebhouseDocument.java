package app.webhouse.cmsreader;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.Map;

/**
 * A single @webhouse/cms document.
 *
 * Mirrors the JSON shape:
 * <pre>
 * {
 *   "slug": "hello-world",
 *   "status": "published",
 *   "locale": "en",
 *   "translationGroup": "uuid",
 *   "data": { ... }
 * }
 * </pre>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class WebhouseDocument {

    public String id;
    public String slug;
    public String status;
    public String locale;
    public String translationGroup;
    public Map<String, Object> data;
    public String createdAt;
    public String updatedAt;

    public boolean isPublished() {
        return "published".equals(status);
    }

    /** Convenience getter for a string field in the data map. */
    public String getString(String key) {
        if (data == null) return null;
        Object value = data.get(key);
        return value instanceof String ? (String) value : null;
    }

    /** Convenience getter for a string field with a default fallback. */
    public String getStringOr(String key, String fallback) {
        String value = getString(key);
        return value != null ? value : fallback;
    }
}
