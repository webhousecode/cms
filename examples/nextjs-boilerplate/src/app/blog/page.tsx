import type { Metadata } from "next";
import Link from "next/link";
import { getCollection, type PostData } from "@/lib/content";

export const metadata: Metadata = {
  title: "Blog",
  description: "Latest posts and articles.",
};

export default function BlogPage() {
  const posts = getCollection<PostData>("posts").sort((a, b) => {
    const da = a.data.date ?? "";
    const db = b.data.date ?? "";
    return db.localeCompare(da);
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-foreground">Blog</h1>

      {posts.length === 0 ? (
        <p className="text-muted">No posts yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
            >
              {post.data.coverImage && (
                <img
                  src={post.data.coverImage}
                  alt={post.data.title}
                  className="mb-4 aspect-video w-full rounded-md object-cover"
                  loading="lazy"
                />
              )}
              <h2 className="text-lg font-semibold text-card-foreground group-hover:text-primary transition-colors">
                {post.data.title}
              </h2>
              {post.data.excerpt && (
                <p className="mt-2 text-sm text-muted line-clamp-3">
                  {post.data.excerpt}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                {post.data.date && <time>{post.data.date}</time>}
                {post.data.author && <span>{post.data.author}</span>}
              </div>
              {post.data.tags && post.data.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
