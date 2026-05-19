// YouTube 분석 Edge Function (Deno)
//
// 두 가지 모드:
//   1) mode='search' (기본) — 키워드로 인기 영상 검색 (publishedAfter 기간 필터 지원)
//   2) mode='trending'      — 인기 급상승 차트 (videoCategoryId로 카테고리 필터)
//
// 인증: 로그인된 사용자만 호출 가능 (anon 거부)
// 시크릿: YOUTUBE_API_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STOPWORDS_KO = new Set([
  '이','그','저','것','수','등','들','및','의','에','를','을','은','는','가','와','과',
  '하다','있다','되다','같다','같은','대한','대해','위한','위해','관한','관해',
  '내','내가','나의','나는','저는','저의','제가','제',
  '오늘','지금','이런','저런','그런','하는','하고','한','할','하면',
  '있는','없는','없다','됩니다','입니다','합니다','했다','했습니다','된다',
  '정말','너무','매우','많이','조금','거의','계속','다시','새로',
]);

const STOPWORDS_EN = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'is','are','was','were','be','been','being',
  'have','has','had','do','does','did',
  'will','would','should','could','can','may','might',
  'this','that','these','those','it','its',
  'i','you','he','she','we','they','my','your','his','her','our','their',
  'how','what','when','where','why','who','which',
  'as','so','if','than','then','too','very','from','about','into','over','only',
  'just','also','more','most','some','any','all','no','not','out','up','down',
]);

interface RawVideoItem {
  id: string | { videoId?: string };
  snippet: {
    title: string;
    description?: string;
    channelTitle: string;
    publishedAt: string;
    tags?: string[];
    thumbnails: { medium?: { url: string }; default?: { url: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration: string };
}

interface AnalyzedVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  url: string;
}

interface KeywordEntry {
  keyword: string;
  count: number;
  videoIds: string[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!YOUTUBE_API_KEY) {
      return json({ error: 'YOUTUBE_API_KEY not configured in Edge Function secrets' }, 500);
    }

    // 인증
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Authentication required' }, 401);
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: 'Invalid or expired session' }, 401);

    const body = await req.json().catch(() => ({}));
    const mode: 'search' | 'trending' = body.mode === 'trending' ? 'trending' : 'search';
    const maxResults = Math.min(Math.max(Number(body.maxResults ?? 25), 5), 50);

    let videos: AnalyzedVideo[];
    let query = '';
    let publishedAfter: string | null = null;
    let videoCategoryId: string | null = null;

    if (mode === 'trending') {
      videoCategoryId = typeof body.videoCategoryId === 'string' && body.videoCategoryId
        ? body.videoCategoryId
        : null;
      videos = await fetchTrendingVideos(maxResults, videoCategoryId);
      query = videoCategoryId ? `[Trending KR - category ${videoCategoryId}]` : '[Trending KR - all]';
    } else {
      query = typeof body.keyword === 'string' ? body.keyword.trim() : '';
      if (!query) return json({ error: 'keyword required for search mode' }, 400);
      publishedAfter = typeof body.publishedAfter === 'string' ? body.publishedAfter : null;
      videos = await fetchSearchVideos(query, maxResults, publishedAfter);
    }

    videos.sort((a, b) => b.viewCount - a.viewCount);
    const keywords = extractKeywords(videos);

    return json({
      mode,
      query,
      videos,
      keywords,
      videoCount: videos.length,
      publishedAfter,
      videoCategoryId,
    });
  } catch (e) {
    console.error('youtube-analyze error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// =================== Fetchers ===================

async function fetchTrendingVideos(maxResults: number, categoryId: string | null): Promise<AnalyzedVideo[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('regionCode', 'KR');
  url.searchParams.set('maxResults', String(maxResults));
  if (categoryId) url.searchParams.set('videoCategoryId', categoryId);
  url.searchParams.set('key', YOUTUBE_API_KEY!);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`YouTube trending failed: ${data.error?.message ?? res.statusText}`);
  }
  return (data.items ?? []).map(mapVideoItem);
}

async function fetchSearchVideos(keyword: string, maxResults: number, publishedAfter: string | null): Promise<AnalyzedVideo[]> {
  // 1. search.list
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('q', keyword);
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('order', 'viewCount');
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('regionCode', 'KR');
  searchUrl.searchParams.set('relevanceLanguage', 'ko');
  if (publishedAfter) searchUrl.searchParams.set('publishedAfter', publishedAfter);
  searchUrl.searchParams.set('key', YOUTUBE_API_KEY!);

  const searchRes = await fetch(searchUrl.toString());
  const searchData = await searchRes.json();
  if (!searchRes.ok || searchData.error) {
    throw new Error(`YouTube search failed: ${searchData.error?.message ?? searchRes.statusText}`);
  }
  const videoIds: string[] = (searchData.items ?? [])
    .map((item: RawVideoItem) => (typeof item.id === 'object' ? item.id.videoId : null))
    .filter((id: string | null | undefined): id is string => !!id);

  if (videoIds.length === 0) return [];

  // 2. videos.list for stats + tags
  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailsUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
  detailsUrl.searchParams.set('id', videoIds.join(','));
  detailsUrl.searchParams.set('key', YOUTUBE_API_KEY!);

  const detailsRes = await fetch(detailsUrl.toString());
  const detailsData = await detailsRes.json();
  if (!detailsRes.ok || detailsData.error) {
    throw new Error(`YouTube details failed: ${detailsData.error?.message ?? detailsRes.statusText}`);
  }
  return (detailsData.items ?? []).map(mapVideoItem);
}

function mapVideoItem(item: RawVideoItem): AnalyzedVideo {
  const id = typeof item.id === 'string' ? item.id : (item.id.videoId ?? '');
  return {
    id,
    title: item.snippet.title,
    description: (item.snippet.description ?? '').slice(0, 300),
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
    tags: item.snippet.tags ?? [],
    viewCount: parseInt(item.statistics?.viewCount ?? '0', 10),
    likeCount: parseInt(item.statistics?.likeCount ?? '0', 10),
    commentCount: parseInt(item.statistics?.commentCount ?? '0', 10),
    duration: item.contentDetails?.duration ?? '',
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

// =================== Keyword extraction ===================

function extractKeywords(videos: AnalyzedVideo[]): KeywordEntry[] {
  const freq = new Map<string, { count: number; videoIds: string[] }>();
  for (const v of videos) {
    const text = `${v.title} ${v.tags.join(' ')}`;
    const tokens = text
      .toLowerCase()
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => {
        if (t.length < 2) return false;
        if (STOPWORDS_KO.has(t) || STOPWORDS_EN.has(t)) return false;
        if (/^\d+$/.test(t)) return false;
        return true;
      });
    const unique = new Set(tokens);
    for (const token of unique) {
      const e = freq.get(token) ?? { count: 0, videoIds: [] };
      e.count += 1;
      e.videoIds.push(v.id);
      freq.set(token, e);
    }
  }
  return Array.from(freq.entries())
    .map(([k, data]) => ({ keyword: k, count: data.count, videoIds: data.videoIds }))
    .filter((k) => k.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
