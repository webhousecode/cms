import { getPage, type Block } from "@/lib/content";
import { BlockRenderer } from "@/components/block-renderer";
import { ArticleBody } from "@/components/article-body";

export function Home() {
  const page = getPage("home");
  if (!page) {
    return (
      <div class="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 class="text-3xl font-bold">Homepage not found</h1>
        <p class="mt-3 text-muted">
          Add <code>content/pages/home.json</code> to create the homepage.
        </p>
      </div>
    );
  }

  const sections = (page.data.sections as Block[] | undefined) ?? [];
  const content = page.data.content as string | undefined;

  return (
    <>
      <BlockRenderer blocks={sections} />
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
