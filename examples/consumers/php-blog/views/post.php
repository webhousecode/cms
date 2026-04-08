<?php
use Webhouse\Cms\Reader;
?>
<article>
    <h1><?= htmlspecialchars(Reader::string($post, 'title')) ?></h1>
    <div class="meta">
        <span><?= htmlspecialchars(Reader::string($post, 'author', 'Unknown')) ?></span>
        <span> · </span>
        <span><?= htmlspecialchars($post['data']['date'] ?? '') ?></span>
        <span> · </span>
        <span><?= htmlspecialchars($post['locale'] ?? '') ?></span>
    </div>
    <?= $content_html ?>

    <?php if ($translation): ?>
        <div class="translation">
            This post is also available in <?= htmlspecialchars($translation['locale'] ?? '') ?>:
            <a href="/blog/<?= htmlspecialchars($translation['slug']) ?>"><?= htmlspecialchars(Reader::string($translation, 'title')) ?></a>
        </div>
    <?php endif; ?>

    <p><a href="/" class="back">← Back to all posts</a></p>
</article>
