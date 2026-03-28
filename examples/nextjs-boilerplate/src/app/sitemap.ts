import type { MetadataRoute } from "next";
import { getCollection, type PageData, type PostData } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

  const pages = getCollection<PageData>("pages").map((page) => ({
    url: `${baseUrl}${page.slug === "home" ? "/" : `/${page.slug}`}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: page.slug === "home" ? 1 : 0.8,
  }));

  const posts = getCollection<PostData>("posts").map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.data.date ? new Date(post.data.date) : new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    ...pages,
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    ...posts,
  ];
}
