<?php

declare(strict_types=1);

/**
 * Front controller for the @webhouse/cms PHP example.
 *
 * Run with: php -S 0.0.0.0:8000 -t public public/index.php
 */

require_once __DIR__ . '/../vendor/autoload.php';

use League\CommonMark\GithubFlavoredMarkdownConverter;
use Webhouse\Cms\Reader;

// Serve static files (uploads) directly
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (str_starts_with($uri, '/uploads/')) {
    $file = __DIR__ . $uri;
    if (is_file($file)) {
        return false; // Let PHP built-in server handle it
    }
}

$cms = new Reader(__DIR__ . '/../content');
$markdown = new GithubFlavoredMarkdownConverter();

function render_template(string $name, array $data): string
{
    extract($data);
    ob_start();
    require __DIR__ . '/../views/' . $name . '.php';
    return (string) ob_get_clean();
}

function render_layout(string $contentName, array $data, Reader $cms): string
{
    $globals = $cms->globals();
    $title = $data['title'] ?? 'Blog';
    $brand_prefix = Reader::string($globals, 'brandPrefix', '@webhouse/cms');
    $brand_suffix = Reader::string($globals, 'brandSuffix', '');
    $footer_text = Reader::string($globals, 'footerText', 'Powered by @webhouse/cms');

    $body = render_template($contentName, $data);
    return render_template('layout', compact('title', 'body', 'brand_prefix', 'brand_suffix', 'footer_text'));
}

// Routes
try {
    if ($uri === '/' || $uri === '') {
        $posts = $cms->collection('posts', 'en');
        echo render_layout('home', ['posts' => $posts, 'locale' => 'en', 'title' => 'Blog (en)'], $cms);
        exit;
    }

    if ($uri === '/da/' || $uri === '/da') {
        $posts = $cms->collection('posts', 'da');
        echo render_layout('home', ['posts' => $posts, 'locale' => 'da', 'title' => 'Blog (da)'], $cms);
        exit;
    }

    if (preg_match('#^/blog/([^/]+)/?$#', $uri, $matches)) {
        $slug = $matches[1];
        try {
            $post = $cms->document('posts', $slug);
        } catch (\InvalidArgumentException) {
            http_response_code(400);
            echo render_layout('error', ['status_code' => 400, 'status_text' => 'Invalid slug', 'title' => '400'], $cms);
            exit;
        }
        if (!$post) {
            http_response_code(404);
            echo render_layout('error', ['status_code' => 404, 'status_text' => 'Post not found', 'title' => '404'], $cms);
            exit;
        }
        $translation = $cms->findTranslation($post, 'posts');
        $content_html = $markdown->convert(Reader::string($post, 'content'))->getContent();
        echo render_layout('post', [
            'post' => $post,
            'translation' => $translation,
            'content_html' => $content_html,
            'title' => Reader::string($post, 'title'),
        ], $cms);
        exit;
    }

    http_response_code(404);
    echo render_layout('error', ['status_code' => 404, 'status_text' => 'Not found', 'title' => '404'], $cms);

} catch (\Throwable $e) {
    http_response_code(500);
    echo render_layout('error', ['status_code' => 500, 'status_text' => $e->getMessage(), 'title' => '500'], $cms);
}
