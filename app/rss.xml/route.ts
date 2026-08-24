import { NextResponse } from 'next/server';
import { SITE } from '../../src/constants/author';
import { getAllPublishedPosts } from '../../src/services/postsServer';

// 빌드 시 out/rss.xml 파일로 생성된다.
export const dynamic = 'force-static';

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export async function GET() {
  const posts = await getAllPublishedPosts();
  const items = posts.slice(0, 20).map((post) => {
    const link = `${SITE.url}/p/${encodeURIComponent(post.id)}`;
    return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${link}</link>
      <description>${escapeXml(post.summary ?? '')}</description>
      <pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <category>${escapeXml(post.type ?? 'playlist')}</category>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE.name}</title>
    <link>${SITE.url}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
