// YouTube 키워드 분석 Edge Function (Deno)
// - 입력: { keyword: string, maxResults?: number }
// - 출력: { query, videos[], keywords[], videoCount }
// - 인증: 로그인된 사용자만 호출 가능 (anon 거부)
//
// 배포: supabase functions deploy youtube-analyze
// 시크릿: supabase secrets set YOUTUBE_API_KEY=... (대시보드에서도 가능)

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

    // 인증 확인 — 로그인된 admin만
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return json({ error: 'Authentication required' }, 401);
    }
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    const maxResults = Math.min(Math.max(Number(body.maxResults ?? 25), 5), 50);

    if (!keyword) {
      return json({ error: 'keyword required (non-empty string)' }, 400);
    }

    // 1. search.list — 키워드로 인기 영상 검색
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', keyword);
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('order', 'viewCount');
    searchUrl.searchParams.set('maxResults', String(maxResults));
    searchUrl.searchParams.set('regionCode', 'KR');
    searchUrl.searchParams.set('relevanceLanguage', 'ko');
    searchUrl.searchParams.set('key', YOUTUBE_API_KEY);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();
    if (!searchRes.ok || searchData.error) {
      return json({ error: `YouTube search failed: ${searchData.error?.message ?? searchRes.statusText}` }, 502);
    }
    const videoIds: string[] = (searchData.items ?? [])
      .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
      .filter((id: string | undefined): id is string => !!id);

    if (videoIds.length === 0) {
      return json({ query: keyword, videos: [], keywords: [], videoCount: 0 });
    }

    // 2. videos.list — 상세 stats + tags
    const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    detailsUrl.searchParams.set('part', 'snippet,statistics,contentDetails');
    detailsUrl.searchParams.set('id', videoIds.join(','));
    detailsUrl.searchParams.set('key', YOUTUBE_API_KEY);

    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = await detailsRes.json();
    if (!detailsRes.ok || detailsData.error) {
      return json({ error: `YouTube details failed: ${detailsData.error?.message ?? detailsRes.statusText}` }, 502);
    }

    const videos: AnalyzedVideo[] = (detailsData.items ?? []).map((item: {
      id: string;
      snippet: {
        title: string; description?: string; channelTitle: string; publishedAt: string;
        tags?: string[]; thumbnails: { medium?: { url: string }; default?: { url: string } };
      };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    }) => ({
      id: item.id,
      title: item.snippet.title,
      description: (item.snippet.description ?? '').slice(0, 300),
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
      tags: item.snippet.tags ?? [],
      viewCount: parseInt(item.statistics.viewCount ?? '0', 10),
      likeCount: parseInt(item.statistics.likeCount ?? '0', 10),
      commentCount: parseInt(item.statistics.commentCount ?? '0', 10),
      duration: item.contentDetails.duration,
      url: `https://www.youtube.com/watch?v=${item.id}`,
    }));

    videos.sort((a, b) => b.viewCount - a.viewCount);

    // 3. 키워드 빈도 추출 (제목 + 태그)
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

    const keywords: KeywordEntry[] = Array.from(freq.entries())
      .map(([k, data]) => ({ keyword: k, count: data.count, videoIds: data.videoIds }))
      .filter((k) => k.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 60);

    return json({ query: keyword, videos, keywords, videoCount: videos.length });
  } catch (e) {
    console.error('youtube-analyze error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
