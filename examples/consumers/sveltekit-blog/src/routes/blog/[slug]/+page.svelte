<script lang="ts">
  import { getString } from '$lib/helpers';
  let { data } = $props();

  // Tiny inline markdown converter
  function md(text: string): string {
    if (!text) return '';
    let html = text;
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _l, code) =>
      `<pre><code>${escape(code.trim())}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    const lines = html.split('\n');
    const out: string[] = [];
    let inP = false;
    for (const line of lines) {
      const t = line.trim();
      if (!t) { if (inP) { out.push('</p>'); inP = false; } continue; }
      if (t.startsWith('<') && !t.startsWith('<code')) {
        if (inP) { out.push('</p>'); inP = false; }
        out.push(t);
        continue;
      }
      if (!inP) { out.push('<p>'); inP = true; } else out.push('<br>');
      out.push(t);
    }
    if (inP) out.push('</p>');
    return out.join('\n');
  }

  function escape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
</script>

<svelte:head>
  <title>{getString(data.post, 'title')}</title>
</svelte:head>

<article>
  <h1>{getString(data.post, 'title')}</h1>
  <div class="meta">
    <span>{getString(data.post, 'author', 'Unknown')}</span>
    <span> · </span>
    <span>{getString(data.post, 'date')}</span>
    <span> · </span>
    <span>{data.post.locale}</span>
  </div>

  {@html md(getString(data.post, 'content'))}

  {#if data.translation}
    <div class="translation">
      This post is also available in {data.translation.locale}:
      <a href="/blog/{data.translation.slug}">{getString(data.translation, 'title')}</a>
    </div>
  {/if}

  <p><a href="/" class="back">← Back to all posts</a></p>
</article>
