import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const BLOG_URL = (process.env.BLOG_BASE_URL || 'https://daily-memorylog.com').replace(/\/$/, '');

// 빌드 환경에 env가 없으면 사이트맵만 비워서 출력 (빌드 자체는 실패시키지 않음)
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠️  Sitemap/RSS: VITE_SUPABASE_URL/KEY missing. Generating empty feeds.');
}

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

interface PostRow {
  id: string;
  title: string;
  summary: string | null;
  createdAt: number;
  type: string;
}

async function fetchPublishedPosts(): Promise<PostRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('posts')
    .select('id, title, summary, createdAt, type')
    .eq('published', true)
    .order('createdAt', { ascending: false });
  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
  return (data ?? []) as PostRow[];
}

function buildSitemap(posts: PostRow[]): string {
  const staticUrls = [
    { loc: BLOG_URL, priority: '1.0', changefreq: 'daily' },
    { loc: `${BLOG_URL}/gallery`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${BLOG_URL}/playlist`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${BLOG_URL}/blog`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${BLOG_URL}/about`, priority: '0.5', changefreq: 'monthly' },
  ];

  const staticBlock = staticUrls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join('\n');

  const postBlock = posts
    .map((p) => {
      const dateStr = new Date(p.createdAt).toISOString().split('T')[0];
      return `  <url>
    <loc>${BLOG_URL}/p/${escapeXml(p.id)}</loc>
    <lastmod>${dateStr}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticBlock}
${postBlock}
</urlset>
`;
}

function buildRss(posts: PostRow[]): string {
  const items = posts
    .slice(0, 20)
    .map((p) => {
      const link = `${BLOG_URL}/p/${escapeXml(p.id)}`;
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <description>${escapeXml(p.summary ?? '')}</description>
      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <category>${escapeXml(p.type)}</category>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>My Space</title>
    <link>${BLOG_URL}</link>
    <description>AI 비전공자가 AI 도구와 생태계를 직접 써보고 정리하는 블로그</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${BLOG_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

async function main() {
  console.log(`Generating sitemap + RSS for ${BLOG_URL}...`);
  const posts = await fetchPublishedPosts();
  console.log(`  Found ${posts.length} published posts`);

  const sitemap = buildSitemap(posts);
  const rss = buildRss(posts);

  const distDir = path.join(process.cwd(), 'dist');
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, 'sitemap.xml'), sitemap, 'utf-8');
  await writeFile(path.join(distDir, 'rss.xml'), rss, 'utf-8');

  console.log('  ✓ dist/sitemap.xml');
  console.log('  ✓ dist/rss.xml');
}

main().catch((e) => {
  console.error('Sitemap generation failed:', e);
  // 사이트맵 생성 실패가 빌드 전체를 막지 않도록 exit 0
  process.exit(0);
});
