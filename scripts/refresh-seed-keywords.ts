/**
 * 동적 시드 풀 갱신 (트렌딩 토픽 + 키워드 둘 다).
 *
 * 매일 cron으로 실행 → YouTube 한국 인기 급상승 (전체 카테고리)을 가져와서:
 *   1) videos → trending_topics 테이블에 적재 (generate-post의 메인 파이프라인)
 *   2) keywords → dynamic_seed_keywords 테이블에 적재 (autocomplete fallback 풀)
 *
 * trending_topics가 비면 generate-post는 dynamic + 정적 키워드 풀로 fallback.
 */

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const ADMIN_EMAIL = process.env.SUPABASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPABASE_ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const SOURCE = 'youtube_trending_kr_all';
const TOP_KEYWORDS = 20;
const MAX_VIDEOS = 50;

interface AnalyzedVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  viewCount: number;
}

interface KeywordEntry {
  keyword: string;
  count: number;
  videoIds: string[];
}

async function fetchTrending(): Promise<{ videos: AnalyzedVideo[]; keywords: KeywordEntry[] }> {
  log(`Invoking youtube-analyze (trending, all categories, maxResults=${MAX_VIDEOS})...`);
  const { data, error } = await supabase.functions.invoke('youtube-analyze', {
    // categoryId 미지정 = 전체 카테고리
    body: { mode: 'trending', maxResults: MAX_VIDEOS },
  });
  if (error) throw new Error(`youtube-analyze failed: ${error.message}`);
  if (!data || !Array.isArray(data.videos) || !Array.isArray(data.keywords)) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
  }
  log(`  ✓ Got ${data.videos.length} videos, ${data.keywords.length} keywords`);
  return { videos: data.videos, keywords: data.keywords };
}

async function refreshTrendingTopics(videos: AnalyzedVideo[]): Promise<void> {
  log(`Upserting ${videos.length} videos into trending_topics (source=${SOURCE})...`);
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  // 같은 video_id+source가 이미 있으면 (used/failed/pending 무관) 무시.
  // 매일 같은 영상이 트렌딩에 또 잡혀도 다시 글 쓰진 않음 — 중복 글 방지.
  for (const v of videos) {
    if (!v.id || !v.title) {
      skipped++;
      continue;
    }
    const { error } = await supabase
      .from('trending_topics')
      .insert({
        video_id: v.id,
        source: SOURCE,
        title: v.title,
        description: (v.description ?? '').slice(0, 1500),
        channel_title: v.channelTitle ?? null,
        thumbnail: v.thumbnail ?? null,
        view_count: v.viewCount ?? null,
        published_at: v.publishedAt ?? null,
      });

    if (!error) {
      inserted++;
    } else if (error.code === '23505') {
      // unique constraint 위반 = 이미 있음. 정상 케이스.
      skipped++;
    } else {
      failed++;
      console.warn(`  insert failed for video ${v.id}:`, error.message);
    }
  }

  log(`  ✅ trending_topics: inserted=${inserted}, already_exists=${skipped}, failed=${failed}`);
}

async function refreshSeedKeywords(keywords: KeywordEntry[]): Promise<void> {
  const filtered = keywords
    .filter((k) => typeof k.keyword === 'string' && k.keyword.length >= 2 && k.keyword.length <= 20)
    .filter((k) => !/^\d+$/.test(k.keyword))
    .slice(0, TOP_KEYWORDS);

  log(`Upserting top ${filtered.length} keywords into dynamic_seed_keywords (source=${SOURCE})...`);
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const k of filtered) {
    const { data: existing, error: selErr } = await supabase
      .from('dynamic_seed_keywords')
      .select('id')
      .eq('keyword', k.keyword)
      .eq('source', SOURCE)
      .maybeSingle();

    if (selErr) {
      failed++;
      console.warn(`  select failed for "${k.keyword}":`, selErr.message);
      continue;
    }

    if (existing) {
      const { error: updErr } = await supabase
        .from('dynamic_seed_keywords')
        .update({ score: k.count, last_seen_at: nowIso, is_active: true })
        .eq('id', existing.id);
      if (updErr) {
        failed++;
        console.warn(`  update failed for "${k.keyword}":`, updErr.message);
      } else {
        updated++;
      }
    } else {
      const { error: insErr } = await supabase
        .from('dynamic_seed_keywords')
        .insert({ keyword: k.keyword, source: SOURCE, score: k.count });
      if (insErr) {
        failed++;
        console.warn(`  insert failed for "${k.keyword}":`, insErr.message);
      } else {
        inserted++;
      }
    }
  }

  log(`  ✅ dynamic_seed_keywords: inserted=${inserted}, updated=${updated}, failed=${failed}`);
}

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  const { videos, keywords } = await fetchTrending();
  // 두 작업이 독립적이므로 둘 중 하나가 실패해도 다른 건 계속 진행.
  try {
    await refreshTrendingTopics(videos);
  } catch (e) {
    console.error('refreshTrendingTopics failed:', e instanceof Error ? e.message : e);
  }
  try {
    await refreshSeedKeywords(keywords);
  } catch (e) {
    console.error('refreshSeedKeywords failed:', e instanceof Error ? e.message : e);
  }

  log('Done.');
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
