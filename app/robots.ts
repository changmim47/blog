import type { MetadataRoute } from 'next';
import { SITE } from '../src/constants/author';

// 빌드 시 out/robots.txt 파일로 생성된다.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/drafts', '/write', '/edit', '/login'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
