/**
 * YouTube 한국 인기 급상승(전체 카테고리)에서 영상 메타데이터를 가져와
 * trending_topics 테이블에 적재.
 *
 * generate-post가 우선순위 chain (manual → trending → autocomplete)에서
 * trending_topics의 pending row를 claim해 그 영상 기반으로 글을 작성함.
 */

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;
const ADMIN_EMAIL = process.env.SUPABASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPABASE_ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Missing required env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const SOURCE = 'youtube_trending_kr_all';
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

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  log(`Invoking youtube-analyze (trending, all categories, maxResults=${MAX_VIDEOS})...`);
  const { data, error } = await supabase.functions.invoke('youtube-analyze', {
    body: { mode: 'trending', maxResults: MAX_VIDEOS },
  });
  if (error) throw new Error(`youtube-analyze failed: ${error.message}`);
  if (!data || !Array.isArray(data.videos)) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const videos = data.videos as AnalyzedVideo[];
  log(`  ✓ Got ${videos.length} videos`);

  // 같은 video_id+source가 이미 있으면 (used/failed/pending 무관) 무시.
  // 매일 같은 영상이 트렌딩에 또 잡혀도 다시 글 쓰진 않음 — 중복 글 방지.
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const v of videos) {
    if (!v.id || !v.title) {
      skipped++;
      continue;
    }
    const { error: insErr } = await supabase
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

    if (!insErr) {
      inserted++;
    } else if (insErr.code === '23505') {
      // unique constraint 위반 = 이미 있음. 정상 케이스.
      skipped++;
    } else {
      failed++;
      console.warn(`  insert failed for video ${v.id}:`, insErr.message);
    }
  }

  log(`✅ trending_topics: inserted=${inserted}, already_exists=${skipped}, failed=${failed}`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
