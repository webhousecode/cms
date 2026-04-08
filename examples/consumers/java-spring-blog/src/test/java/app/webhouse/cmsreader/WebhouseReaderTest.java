package app.webhouse.cmsreader;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * F125 Phase 1 — JUnit tests for WebhouseReader.
 *
 * Verifies the file-based reader correctly:
 *   - Lists published documents
 *   - Filters by locale
 *   - Skips drafts
 *   - Loads single documents
 *   - Resolves translations via translationGroup
 *   - Rejects path traversal attempts
 *   - Skips malformed JSON without crashing
 */
class WebhouseReaderTest {

    @TempDir
    Path contentDir;

    private WebhouseReader reader;

    @BeforeEach
    void setUp() throws IOException {
        reader = new WebhouseReader(contentDir.toString());

        // Seed: 2 published English posts, 1 published Danish post, 1 draft
        Path postsDir = Files.createDirectory(contentDir.resolve("posts"));

        Files.writeString(postsDir.resolve("hello-world.json"), """
            {
              "id": "hello-en",
              "slug": "hello-world",
              "status": "published",
              "locale": "en",
              "translationGroup": "tg-1",
              "data": { "title": "Hello", "content": "World", "date": "2026-01-15" }
            }
            """);

        Files.writeString(postsDir.resolve("hello-world-da.json"), """
            {
              "id": "hello-da",
              "slug": "hello-world-da",
              "status": "published",
              "locale": "da",
              "translationGroup": "tg-1",
              "data": { "title": "Hej", "content": "Verden", "date": "2026-01-15" }
            }
            """);

        Files.writeString(postsDir.resolve("second-post.json"), """
            {
              "id": "second",
              "slug": "second-post",
              "status": "published",
              "locale": "en",
              "translationGroup": "tg-2",
              "data": { "title": "Second", "date": "2026-02-01" }
            }
            """);

        Files.writeString(postsDir.resolve("draft.json"), """
            {
              "id": "draft",
              "slug": "draft",
              "status": "draft",
              "locale": "en",
              "data": { "title": "Draft" }
            }
            """);

        // Malformed file — must not crash the reader
        Files.writeString(postsDir.resolve("bad.json"), "{ this is not json");
    }

    @Test
    void collection_returnsAllPublishedRegardlessOfLocale() {
        List<WebhouseDocument> all = reader.collection("posts", null);
        assertEquals(3, all.size(), "Should return 3 published posts (skip draft + malformed)");
    }

    @Test
    void collection_filtersByLocale() {
        List<WebhouseDocument> en = reader.collection("posts", "en");
        assertEquals(2, en.size(), "Should return 2 English posts");
        en.forEach(doc -> assertEquals("en", doc.locale));
    }

    @Test
    void collection_returnsDanishPostsOnly() {
        List<WebhouseDocument> da = reader.collection("posts", "da");
        assertEquals(1, da.size());
        assertEquals("da", da.get(0).locale);
        assertEquals("Hej", da.get(0).getString("title"));
    }

    @Test
    void collection_skipsDraftStatus() {
        List<WebhouseDocument> all = reader.collection("posts", null);
        assertTrue(all.stream().noneMatch(d -> "draft".equals(d.status)));
    }

    @Test
    void collection_skipsMalformedJson() {
        // The seed has bad.json — assertion is that we don't throw
        assertDoesNotThrow(() -> reader.collection("posts", null));
    }

    @Test
    void collection_sortsByDateDescending() {
        List<WebhouseDocument> all = reader.collection("posts", "en");
        assertEquals("second-post", all.get(0).slug, "Newest first");
        assertEquals("hello-world", all.get(1).slug);
    }

    @Test
    void collection_returnsEmptyForMissingDir() {
        List<WebhouseDocument> result = reader.collection("nonexistent", null);
        assertTrue(result.isEmpty());
    }

    @Test
    void document_loadsPublishedPost() {
        Optional<WebhouseDocument> doc = reader.document("posts", "hello-world");
        assertTrue(doc.isPresent());
        assertEquals("Hello", doc.get().getString("title"));
    }

    @Test
    void document_returnsEmptyForDraft() {
        Optional<WebhouseDocument> doc = reader.document("posts", "draft");
        assertTrue(doc.isEmpty(), "Draft posts should not be returned");
    }

    @Test
    void document_returnsEmptyForMissing() {
        Optional<WebhouseDocument> doc = reader.document("posts", "does-not-exist");
        assertTrue(doc.isEmpty());
    }

    @Test
    void findTranslation_resolvesViaTranslationGroup() {
        WebhouseDocument enPost = reader.document("posts", "hello-world").orElseThrow();
        Optional<WebhouseDocument> daPost = reader.findTranslation(enPost, "posts");
        assertTrue(daPost.isPresent());
        assertEquals("da", daPost.get().locale);
        assertEquals("hello-world-da", daPost.get().slug);
    }

    @Test
    void findTranslation_returnsEmptyForUntranslatedPost() {
        WebhouseDocument secondPost = reader.document("posts", "second-post").orElseThrow();
        Optional<WebhouseDocument> translation = reader.findTranslation(secondPost, "posts");
        assertTrue(translation.isEmpty(), "second-post has tg-2 with no other documents");
    }

    @Test
    void findTranslation_returnsEmptyWhenTranslationGroupMissing() {
        WebhouseDocument doc = new WebhouseDocument();
        doc.translationGroup = null;
        Optional<WebhouseDocument> result = reader.findTranslation(doc, "posts");
        assertTrue(result.isEmpty());
    }

    // ── Security ──────────────────────────────────────────────

    @Test
    void document_rejectsPathTraversalSlug() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", "../../etc/passwd"));
    }

    @Test
    void document_rejectsPathTraversalCollection() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("../../../etc", "passwd"));
    }

    @Test
    void document_rejectsAbsolutePath() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", "/etc/passwd"));
    }

    @Test
    void document_rejectsSlugWithDots() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", "hello..world"));
    }

    @Test
    void document_rejectsSlugWithSlash() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", "hello/world"));
    }

    @Test
    void document_acceptsValidSlugs() {
        // Should NOT throw
        assertDoesNotThrow(() -> reader.document("posts", "hello-world"));
        assertDoesNotThrow(() -> reader.document("posts", "post-2026-01-15"));
        assertDoesNotThrow(() -> reader.document("posts", "a"));
    }

    @Test
    void document_rejectsUppercaseSlug() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", "Hello-World"));
    }

    @Test
    void document_rejectsEmptySlug() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", ""));
    }

    @Test
    void document_rejectsNullSlug() {
        assertThrows(IllegalArgumentException.class,
            () -> reader.document("posts", null));
    }

    // ── Document helpers ──────────────────────────────────────

    @Test
    void getString_returnsValueWhenPresent() {
        WebhouseDocument doc = reader.document("posts", "hello-world").orElseThrow();
        assertEquals("Hello", doc.getString("title"));
    }

    @Test
    void getString_returnsNullForMissingKey() {
        WebhouseDocument doc = reader.document("posts", "hello-world").orElseThrow();
        assertNull(doc.getString("nonexistent"));
    }

    @Test
    void getStringOr_returnsFallback() {
        WebhouseDocument doc = reader.document("posts", "hello-world").orElseThrow();
        assertEquals("default", doc.getStringOr("nonexistent", "default"));
    }

    @Test
    void isPublished_trueForPublished() {
        WebhouseDocument doc = reader.document("posts", "hello-world").orElseThrow();
        assertTrue(doc.isPublished());
    }
}
