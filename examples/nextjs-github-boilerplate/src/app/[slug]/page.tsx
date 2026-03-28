import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollection, getDocument, type PageData } from "@/lib/content";
import { BlockRenderer } from "@/components/block-renderer";
import { ArticleBody } from "@/components/article-body";
import { MapEmbed } from "@/components/map-embed";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getCollection<PageData>("pages")
    .filter((p) => p.slug !== "home")
    .map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocument<PageData>("pages", slug);
  if (!doc) return {};

  const seo = doc.data._seo;
  return {
    title: seo?.metaTitle ?? doc.data.title,
    description: seo?.metaDescription ?? doc.data.metaDescription,
    openGraph: seo?.ogImage ? { images: [seo.ogImage] } : undefined,
  };
}

export default async function DynamicPage({ params }: Props) {
  const { slug } = await params;

  // "home" is handled by src/app/page.tsx
  if (slug === "home") notFound();

  const doc = getDocument<PageData>("pages", slug);
  if (!doc || doc.status !== "published") notFound();

  const { data } = doc;

  // JSON-LD for pages
  const jsonLd = data._seo?.jsonLd ?? {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: data.title,
    description: data._seo?.metaDescription ?? data.metaDescription,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {data.sections && data.sections.length > 0 && (
        <BlockRenderer blocks={data.sections} />
      )}

      <div className="mx-auto max-w-3xl px-4 py-12">
        {(!data.sections || data.sections.length === 0) && (
          <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-foreground">
            {data.title}
          </h1>
        )}

        {data.content && <ArticleBody content={data.content} />}

        {data.location && (
          <MapEmbed
            lat={data.location.lat}
            lng={data.location.lng}
            address={data.location.address}
            zoom={data.location.zoom}
          />
        )}
      </div>
    </>
  );
}
