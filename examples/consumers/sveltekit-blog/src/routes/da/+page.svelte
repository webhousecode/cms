<script lang="ts">
  import { getString } from '$lib/helpers';
  let { data } = $props();
</script>

<h1>Blog</h1>
<p class="lead">Indhold læst fra @webhouse/cms JSON-filer af en SvelteKit-app.</p>

{#if data.posts.length === 0}
  <p>Ingen publicerede indlæg endnu.</p>
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
