<script lang="ts">
  let { data, children } = $props();
</script>

<svelte:head>
  <title>{data.globals.brandPrefix} · {data.globals.brandSuffix}</title>
</svelte:head>

<nav>
  <a href="/" class="brand">{data.globals.brandPrefix} · {data.globals.brandSuffix}</a>
  <div>
    <a href="/">EN</a>
    <a href="/da/">DA</a>
  </div>
</nav>

{@render children()}

<footer>{data.globals.footerText}</footer>

<style>
  :global(:root) { --gold: #F7BB2E; --dark: #0D0D0D; --text: #e8e8e8; --text-dim: #888; --border: #222; }
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--dark); color: var(--text); line-height: 1.7; max-width: 740px; margin: 0 auto; padding: 3rem 2rem; }
  nav { display: flex; justify-content: space-between; align-items: center; padding-bottom: 2rem; border-bottom: 1px solid var(--border); margin-bottom: 3rem; }
  nav .brand { font-family: 'JetBrains Mono', monospace; color: var(--gold); font-weight: 600; text-decoration: none; }
  nav a { color: var(--text-dim); text-decoration: none; margin-left: 1.5rem; font-size: 0.85rem; }
  nav a:hover { color: var(--gold); }
  :global(h1) { font-size: 2.5rem; color: #fff; margin-bottom: 0.5rem; line-height: 1.15; }
  :global(h2) { font-size: 1.4rem; color: #fff; margin: 2rem 0 1rem; }
  :global(h3) { color: #fff; margin: 0; font-size: 1.2rem; }
  :global(p) { margin-bottom: 1rem; color: #ccc; }
  :global(a) { color: var(--gold); }
  :global(.lead) { color: var(--text-dim); margin-bottom: 3rem; font-size: 1rem; }
  :global(.meta) { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 0.5rem; font-family: 'JetBrains Mono', monospace; }
  :global(.post-card) { display: block; padding: 1.5rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; text-decoration: none; transition: border-color 0.2s; }
  :global(.post-card:hover) { border-color: var(--gold); }
  :global(.post-card .meta) { color: #555; font-size: 0.75rem; margin-bottom: 0.5rem; }
  :global(.post-card p) { color: var(--text-dim); font-size: 0.9rem; margin: 0.4rem 0 0; }
  :global(article p) { color: #ccc; }
  :global(.translation) { margin-top: 3rem; padding: 1rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; color: var(--text-dim); }
  :global(.back) { display: inline-block; margin-top: 2rem; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
  footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.8rem; text-align: center; }
</style>
