/**
 * F99 — Test data helpers for Playwright E2E tests.
 *
 * Seed and cleanup content documents via the CMS API.
 */
import type { Page } from "@playwright/test";

/** Create a document via the API */
export async function seedDocument(
  page: Page,
  collection: string,
  slug: string,
  data: Record<string, unknown>,
) {
  return page.request.post(`/api/cms/content/${collection}/${slug}`, {
    data: { ...data, status: "draft" },
  });
}

/** Delete a document via the API */
export async function deleteDocument(page: Page, collection: string, slug: string) {
  return page.request.delete(`/api/cms/content/${collection}/${slug}`);
}

/**
 * Seed a document and return a cleanup function.
 *
 * Usage:
 *   const cleanup = await seedAndCleanup(page, "posts", "test-post", { title: "Test" });
 *   // ... run test ...
 *   await cleanup();
 */
export async function seedAndCleanup(
  page: Page,
  collection: string,
  slug: string,
  data: Record<string, unknown>,
) {
  await seedDocument(page, collection, slug, data);
  return async () => {
    await deleteDocument(page, collection, slug).catch(() => {});
  };
}
