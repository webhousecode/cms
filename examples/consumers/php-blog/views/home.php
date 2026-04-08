<?php
use Webhouse\Cms\Reader;
?>
<h1>Blog</h1>
<p class="lead">Content read from @webhouse/cms JSON files by a PHP <?= htmlspecialchars($locale) ?> app.</p>

<?php if (!$posts): ?>
    <p>No published posts yet.</p>
<?php endif; ?>

<?php foreach ($posts as $post): ?>
    <a href="/blog/<?= htmlspecialchars($post['slug']) ?>" class="post-card">
        <div class="meta">
            <span><?= htmlspecialchars($post['data']['date'] ?? '') ?></span>
            <span> · </span>
            <span><?= htmlspecialchars($post['locale'] ?? '') ?></span>
        </div>
        <h3><?= htmlspecialchars(Reader::string($post, 'title')) ?></h3>
        <p><?= htmlspecialchars(Reader::string($post, 'excerpt')) ?></p>
    </a>
<?php endforeach; ?>
