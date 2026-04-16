import { getPosts } from "@/lib/content";

export function BlogList() {
  const posts = getPosts();

  return (
    <section class="py-12">
      <div class="mx-auto max-w-3xl px-4">
        <h1 class="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Blog
        </h1>
        <p class="mt-3 text-muted">Thoughts, tutorials, and updates.</p>

        <div class="mt-10 space-y-6">
          {posts.length === 0 && (
            <p class="text-muted">No posts yet. Add one in <code>content/posts/</code>.</p>
          )}
          {posts.map((post) => {
            const title = post.data.title as string;
            const excerpt = post.data.excerpt as string | undefined;
            const date = post.data.date as string | undefined;
            const author = post.data.author as string | undefined;

            return (
              <article
                key={post.slug}
                class="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
              >
                <a href={`/blog/${post.slug}`} class="block">
                  <h2 class="text-xl font-semibold text-card-foreground">
                    {title}
                  </h2>
                  {excerpt && (
                    <p class="mt-2 text-sm text-muted">{excerpt}</p>
                  )}
                  <div class="mt-3 flex items-center gap-3 text-xs text-muted">
                    {date && <time>{formatDate(date)}</time>}
                    {author && <span>· {author}</span>}
                  </div>
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}
