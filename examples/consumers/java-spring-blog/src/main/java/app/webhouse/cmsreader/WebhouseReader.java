package app.webhouse.cmsreader;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * F125 Phase 1 — Java reader for @webhouse/cms file-based content.
 *
 * Reads JSON documents from {@code content/{collection}/} and exposes them as
 * {@link WebhouseDocument} instances. Designed to be thin, dependency-light
 * (Jackson only), and safe — slugs and collection names are validated against
 * {@link #SAFE_NAME} to prevent path traversal.
 *
 * <p>Reference implementation for the future {@code app.webhouse:cms-reader}
 * Maven Central package.
 */
public final class WebhouseReader {

    /** Allowed pattern for collection names and slugs. */
    private static final Pattern SAFE_NAME = Pattern.compile("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$");

    private final Path contentDir;
    private final ObjectMapper mapper;

    public WebhouseReader(String contentDir) {
        this(Path.of(contentDir));
    }

    public WebhouseReader(Path contentDir) {
        this.contentDir = contentDir.toAbsolutePath().normalize();
        this.mapper = new ObjectMapper();
    }

    /**
     * List all published documents in a collection, optionally filtered by locale.
     *
     * @param collection collection name (e.g. "posts")
     * @param locale     optional locale filter (e.g. "en"); pass {@code null} for all
     * @return documents sorted by {@code data.date} descending (newest first)
     */
    public List<WebhouseDocument> collection(String collection, String locale) {
        validateName(collection);
        Path dir = contentDir.resolve(collection);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }

        List<WebhouseDocument> docs = new ArrayList<>();
        try (Stream<Path> stream = Files.list(dir)) {
            stream
                .filter(p -> p.getFileName().toString().endsWith(".json"))
                .forEach(p -> {
                    try {
                        WebhouseDocument doc = mapper.readValue(p.toFile(), WebhouseDocument.class);
                        if (!doc.isPublished()) return;
                        if (locale != null && !locale.equals(doc.locale)) return;
                        docs.add(doc);
                    } catch (IOException ignored) {
                        // Skip malformed files rather than crash the whole listing.
                    }
                });
        } catch (IOException e) {
            return List.of();
        }

        docs.sort(Comparator.comparing(
            (WebhouseDocument d) -> d.getStringOr("date", ""),
            Comparator.reverseOrder()
        ));
        return docs;
    }

    /** Convenience overload — returns all locales. */
    public List<WebhouseDocument> collection(String collection) {
        return collection(collection, null);
    }

    /**
     * Load a single published document by collection and slug.
     *
     * @return the document, or {@link Optional#empty()} if not found or unpublished
     */
    public Optional<WebhouseDocument> document(String collection, String slug) {
        validateName(collection);
        validateName(slug);
        Path file = contentDir.resolve(collection).resolve(slug + ".json");
        if (!file.startsWith(contentDir) || !Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            WebhouseDocument doc = mapper.readValue(file.toFile(), WebhouseDocument.class);
            return doc.isPublished() ? Optional.of(doc) : Optional.empty();
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    /**
     * Find the sibling translation of a document via its {@code translationGroup}.
     *
     * @return the translation in any other locale, or empty if none exists
     */
    public Optional<WebhouseDocument> findTranslation(WebhouseDocument doc, String collection) {
        if (doc == null || doc.translationGroup == null || doc.translationGroup.isEmpty()) {
            return Optional.empty();
        }
        return collection(collection).stream()
            .filter(other -> doc.translationGroup.equals(other.translationGroup))
            .filter(other -> doc.locale == null || !doc.locale.equals(other.locale))
            .findFirst();
    }

    private static void validateName(String name) {
        if (name == null || !SAFE_NAME.matcher(name).matches()) {
            throw new IllegalArgumentException(
                "Invalid name '" + name + "' — must match " + SAFE_NAME.pattern()
            );
        }
    }
}
