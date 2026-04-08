<?php

declare(strict_types=1);

/**
 * F125 reference reader for @webhouse/cms file-based content (PHP).
 *
 * Reads JSON documents from content/{collection}/ and exposes them as plain
 * arrays. Designed to be thin (PHP stdlib only), and safe — slugs and
 * collection names are validated against SAFE_NAME to prevent path traversal.
 *
 * Reference implementation for the future webhouse/cms-reader Packagist package.
 * Drop into a Laravel app under app/Services/Webhouse/Reader.php — the API
 * is identical.
 */

namespace Webhouse\Cms;

class Reader
{
    private const SAFE_NAME = '/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/';

    private string $contentDir;

    public function __construct(string $contentDir)
    {
        $this->contentDir = realpath($contentDir) ?: $contentDir;
    }

    /**
     * List all published documents in a collection.
     *
     * @param  string  $collection  collection name (e.g. "posts")
     * @param  string|null  $locale  optional locale filter; pass null for all
     * @return array<int, array>  documents sorted by data.date descending
     */
    public function collection(string $collection, ?string $locale = null): array
    {
        $this->validateName($collection);

        $dir = $this->contentDir . DIRECTORY_SEPARATOR . $collection;
        if (!is_dir($dir)) {
            return [];
        }

        $docs = [];
        foreach (glob($dir . '/*.json') ?: [] as $file) {
            $raw = file_get_contents($file);
            if ($raw === false) {
                continue;
            }
            try {
                $doc = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                continue;
            }
            if (!is_array($doc)) {
                continue;
            }
            if (($doc['status'] ?? null) !== 'published') {
                continue;
            }
            if ($locale !== null && ($doc['locale'] ?? null) !== $locale) {
                continue;
            }
            $docs[] = $doc;
        }

        usort($docs, fn ($a, $b) => strcmp(
            $b['data']['date'] ?? '',
            $a['data']['date'] ?? ''
        ));

        return $docs;
    }

    /**
     * Load a single published document by collection and slug.
     *
     * @return array|null  the document, or null if not found/unpublished
     * @throws \InvalidArgumentException  on path traversal attempts
     */
    public function document(string $collection, string $slug): ?array
    {
        $this->validateName($collection);
        $this->validateName($slug);

        $path = $this->contentDir . DIRECTORY_SEPARATOR . $collection . DIRECTORY_SEPARATOR . $slug . '.json';
        $resolved = realpath($path);

        if ($resolved === false || !str_starts_with($resolved, $this->contentDir)) {
            return null;
        }

        $raw = file_get_contents($resolved);
        if ($raw === false) {
            return null;
        }

        try {
            $doc = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (!is_array($doc) || ($doc['status'] ?? null) !== 'published') {
            return null;
        }

        return $doc;
    }

    /**
     * Find the sibling translation of a document via translationGroup.
     */
    public function findTranslation(array $doc, string $collection): ?array
    {
        $tg = $doc['translationGroup'] ?? null;
        if (!$tg) {
            return null;
        }
        foreach ($this->collection($collection) as $other) {
            if (($other['translationGroup'] ?? null) === $tg && ($other['locale'] ?? null) !== ($doc['locale'] ?? null)) {
                return $other;
            }
        }
        return null;
    }

    /** Cached singleton globals/site.json document. */
    private ?array $globals = null;

    public function globals(): array
    {
        if ($this->globals === null) {
            $this->globals = $this->document('globals', 'site') ?? [];
        }
        return $this->globals;
    }

    private function validateName(string $name): void
    {
        if (!preg_match(self::SAFE_NAME, $name)) {
            throw new \InvalidArgumentException("Invalid name '{$name}' — must match " . self::SAFE_NAME);
        }
    }

    /** Helper: safely extract a string field from doc.data. */
    public static function string(?array $doc, string $key, string $default = ''): string
    {
        if (!$doc || !isset($doc['data'][$key]) || !is_string($doc['data'][$key])) {
            return $default;
        }
        return $doc['data'][$key];
    }
}
