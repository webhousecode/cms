import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollection, getDocument, type PostData } from "@/lib/content";
import { ArticleBody } from "@/components/article-body";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getCollection<PostData>("posts").map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocument<PostData>("posts", slug);
  if (!doc) return {};

  const seo = doc.data._seo;
  const title = seo?.metaTitle ?? doc.data.title;
  const description = seo?.metaDescription ?? doc.data.excerpt;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: doc.data.date,
      ...(seo?.ogImage ? { images: [seo.ogImage] } : {}),
    },
    other: seo?.jsonLd
      ? undefined
      : undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const doc = getDocument<PostData>("posts", slug);
  if (!doc || doc.status !== "published") notFound();

  const { data } = doc;
  const seo = data._seo;

  // JSON-LD structured data
  const jsonLd = seo?.jsonLd ?? {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: data.title,
    description: data.excerpt,
    datePublished: data.date,
    author: data.author
      ? { "@type": "Person", name: data.author }
      : undefined,
    ...(data.coverImage ? { image: data.coverImage } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/blog"
          className="mb-6 inline-block text-sm text-muted hover:text-foreground transition-colors"
        >
          &larr; Back to blog
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {data.title}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-sm text-muted">
            {data.date && <time dateTime={data.date}>{data.date}</time>}
            {data.author && <span>by {data.author}</span>}
          </div>
          {data.tags && data.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {data.coverImage && (
          <img
            src={data.coverImage}
            alt={data.title}
            className="mb-8 w-full rounded-lg object-cover"
          />
        )}

        {data.content && <ArticleBody content={data.content} />}
      </article>
    </>
  );
}
