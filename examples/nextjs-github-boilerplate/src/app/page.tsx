import type { Metadata } from "next";
import { getDocument, type PageData } from "@/lib/content";
import { BlockRenderer } from "@/components/block-renderer";
import { ArticleBody } from "@/components/article-body";
import { MapEmbed } from "@/components/map-embed";

export function generateMetadata(): Metadata {
  const doc = getDocument<PageData>("pages", "home");
  if (!doc) return {};

  const seo = doc.data._seo;
  return {
    title: seo?.metaTitle ?? doc.data.title,
    description: seo?.metaDescription ?? doc.data.metaDescription,
    openGraph: seo?.ogImage ? { images: [seo.ogImage] } : undefined,
  };
}

export default function HomePage() {
  const doc = getDocument<PageData>("pages", "home");
  if (!doc) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="text-3xl font-bold">Welcome</h1>
        <p className="mt-4 text-muted">
          Create <code>content/pages/home.json</code> to get started.
        </p>
      </div>
    );
  }

  const { data } = doc;

  return (
    <>
      {data.sections && data.sections.length > 0 && (
        <BlockRenderer blocks={data.sections} />
      )}

      {data.content && (
        <div className="mx-auto max-w-3xl px-4 py-12">
          <ArticleBody content={data.content} />
        </div>
      )}

      {data.location && (
        <div className="mx-auto max-w-3xl px-4 pb-12">
          <MapEmbed
            lat={data.location.lat}
            lng={data.location.lng}
            address={data.location.address}
            zoom={data.location.zoom}
          />
        </div>
      )}
    </>
  );
}
