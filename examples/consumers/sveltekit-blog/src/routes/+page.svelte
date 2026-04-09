<script lang="ts">
  import { getString } from '$lib/webhouse';
  let { data } = $props();
</script>

<h1>Blog</h1>
<p class="lead">Content read from @webhouse/cms JSON files by a SvelteKit app.</p>

{#if data.posts.length === 0}
  <p>No published posts yet.</p>
{/if}

{#each data.posts as post (post.slug)}
  <a href="/blog/{post.slug}" class="post-card">
    <div class="meta">
      <span>{getString(post, 'date')}</span>
      <span> · </span>
      <span>{post.locale}</span>
    </div>
    <h3>{getString(post, 'title')}</h3>
    <p>{getString(post, 'excerpt')}</p>
  </a>
{/each}
