# php-blog — @webhouse/cms consumer example

A pure PHP 8 application reading @webhouse/cms JSON content. The `src/Reader.php` class is **drop-in compatible with Laravel** — register it as a singleton service and inject into controllers.

**Stack:** PHP 8.1+ · league/commonmark for markdown · zero framework dependencies

## Quick start

```bash
cd examples/consumers/php-blog
composer install
php -S 0.0.0.0:8000 -t public public/index.php
```

Open http://localhost:8000 (EN) or http://localhost:8000/da/ (DA).

## How it works

```
content/                    ← @webhouse/cms JSON files
src/Reader.php              ← reader (~140 LOC, stdlib only)
public/index.php            ← front controller (PHP built-in server)
views/                      ← PHP templates
composer.json
```

```php
use Webhouse\Cms\Reader;

$cms = new Reader('content');
$posts = $cms->collection('posts', 'en');
$post  = $cms->document('posts', 'hello-world');
$trans = $cms->findTranslation($post, 'posts');
```

## Laravel compatibility

The `Webhouse\Cms\Reader` class has zero Laravel dependencies. To use in a Laravel app:

1. Copy `src/Reader.php` to `app/Services/Webhouse/Reader.php`
2. Register as a singleton in your service provider
3. Inject into controllers via constructor injection
4. Use in Blade templates with `$post['data']['title']` accessor

## Security

`Reader::validateName()` rejects collection names and slugs that don't match `^[a-z0-9][a-z0-9-]*$`. Resolved paths via `realpath()` are also checked against the content directory prefix.

## Related

- **F125** — Framework-Agnostic Content Platform
- [docs.webhouse.app/docs/consume-laravel](https://docs.webhouse.app/docs/consume-laravel)
