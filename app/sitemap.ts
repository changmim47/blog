import type { MetadataRoute } from 'next';
import { SITE } from '../src/constants/author';
import { getAllPublishedPosts } from '../src/services/postsServer';

// 빌드 시 out/sitemap.xml 파일로 생성된다.
export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPublishedPosts();
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE.url, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE.url}/gallery`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE.url}/playlist`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE.url}/blog`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE.url}/about`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  return [
    ...staticPages,
    ...posts.map((post) => ({
      url: `${SITE.url}/p/${encodeURIComponent(post.id)}`,
      lastModified: post.updated_at
        ? new Date(post.updated_at)
        : new Date(post.updatedAt ?? post.createdAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
