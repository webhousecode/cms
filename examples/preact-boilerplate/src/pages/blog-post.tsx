import { useRoute } from "preact-iso";
import { getPost } from "@/lib/content";
import { ArticleBody } from "@/components/article-body";
import { NotFound } from "./not-found";

export function BlogPost() {
  const { params } = useRoute();
  const slug = params.slug ?? "";
  const post = getPost(slug);
  if (!post) return <NotFound />;

  const title = post.data.title as string;
  const excerpt = post.data.excerpt as string | undefined;
  const date = post.data.date as string | undefined;
  const author = post.data.author as string | undefined;
  const coverImage = post.data.coverImage as string | undefined;
  const content = post.data.content as string | undefined;
  const tags = (post.data.tags as string[] | undefined) ?? [];

  return (
    <article class="py-12">
      <div class="mx-auto max-w-3xl px-4">
        <a
          href="/blog"
          class="text-sm text-muted hover:text-foreground transition-colors"
        >
          ← Back to blog
        </a>

        <h1 class="mt-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>

        {excerpt && <p class="mt-4 text-lg text-muted">{excerpt}</p>}

        <div class="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted">
          {date && <time>{formatDate(date)}</time>}
          {author && <span>· {author}</span>}
          {tags.length > 0 && (
            <span class="flex gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  class="rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </span>
          )}
        </div>

        {coverImage && (
          <img
            src={coverImage}
            alt={title}
            class="mt-8 rounded-lg w-full h-auto"
          />
        )}

        {content && (
          <div class="mt-8">
            <ArticleBody content={content} />
          </div>
        )}
      </div>
    </article>
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
