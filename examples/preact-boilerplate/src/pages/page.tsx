import { useLocation } from "preact-iso";
import { getPage, type Block } from "@/lib/content";
import { BlockRenderer } from "@/components/block-renderer";
import { ArticleBody } from "@/components/article-body";
import { NotFound } from "./not-found";

export function PageView() {
  const { path } = useLocation();
  const slug = path.replace(/^\//, "").replace(/\/$/, "");

  if (!slug || slug === "blog") return <NotFound />;

  const page = getPage(slug);
  if (!page) return <NotFound />;

  const title = page.data.title as string;
  const sections = (page.data.sections as Block[] | undefined) ?? [];
  const content = page.data.content as string | undefined;

  return (
    <>
      {sections.length > 0 ? (
        <BlockRenderer blocks={sections} />
      ) : (
        <header class="border-b border-border bg-secondary py-12">
          <div class="mx-auto max-w-3xl px-4">
            <h1 class="text-3xl font-extrabold text-foreground sm:text-4xl">
              {title}
            </h1>
          </div>
        </header>
      )}
      {content && (
        <section class="py-12">
          <div class="mx-auto max-w-3xl px-4">
            <ArticleBody content={content} />
          </div>
        </section>
      )}
    </>
  );
}
