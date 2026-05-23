/**
 * 동적 시드 키워드 풀 갱신.
 *
 * YouTube 인기 급상승 (한국, 과학기술 카테고리)의 영상 제목·태그에서
 * 자주 등장하는 키워드 상위 N개를 추출 → dynamic_seed_keywords 테이블에 upsert.
 *
 * 같은 (keyword, source) 조합이면 score와 last_seen_at 갱신.
 * 새 조합이면 insert (first_seen_at은 자동 default now()).
 *
 * generate-post.ts가 다음 실행 시 정적 SEED_KEYWORDS + 이 동적 풀을 합쳐서
 * autocomplete 쿼리에 사용 → 시간이 지나도 시드가 묵지 않음.
 */

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const ADMIN_EMAIL = process.env.SUPABASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPABASE_ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Missing required env vars (VITE_SUPABASE_URL / VITE_SUPABASE_KEY / SUPABASE_ADMIN_EMAIL / SUPABASE_ADMIN_PASSWORD)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

// 한 번에 보존할 상위 키워드 수 (트렌딩 영상 50개에서 추출되므로 너무 많으면 노이즈)
const TOP_N = 20;

// YouTube videoCategoryId 28 = Science & Technology (AI 관련 영상이 주로 잡힘)
// 다른 카테고리도 보고 싶으면 여기 늘리면 됨.
const SOURCES: { source: string; categoryId: string }[] = [
  { source: 'youtube_trending_28', categoryId: '28' },
];

interface KeywordEntry {
  keyword: string;
  count: number;
  videoIds: string[];
}

async function refreshOneSource(source: string, categoryId: string): Promise<void> {
  log(`[${source}] invoking youtube-analyze (trending, category=${categoryId})...`);
  const { data, error } = await supabase.functions.invoke('youtube-analyze', {
    body: { mode: 'trending', videoCategoryId: categoryId, maxResults: 50 },
  });
  if (error) throw new Error(`youtube-analyze failed: ${error.message}`);
  if (!data || !Array.isArray(data.keywords)) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
  }

  const keywords = data.keywords as KeywordEntry[];
  log(`  ✓ Got ${keywords.length} raw keywords from ${data.videoCount ?? '?'} videos`);

  // 노이즈 추가 필터 (youtube-analyze에서 1차 필터링되긴 했지만 한 번 더)
  const filtered = keywords
    .filter((k) => typeof k.keyword === 'string' && k.keyword.length >= 2 && k.keyword.length <= 20)
    .filter((k) => !/^\d+$/.test(k.keyword))
    .slice(0, TOP_N);

  log(`  ✓ Filtered to top ${filtered.length}`);

  if (filtered.length === 0) {
    log(`  ⚠️  [${source}] No keywords to write. Trending category may be empty today.`);
    return;
  }

  // (keyword, source) 단위로 upsert.
  // 한 주기에 50개 미만이라 한 줄씩 처리해도 부담 없고, score 누적/덮어쓰기 의도를 명확히 표현할 수 있음.
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const k of filtered) {
    const { data: existing, error: selErr } = await supabase
      .from('dynamic_seed_keywords')
      .select('id')
      .eq('keyword', k.keyword)
      .eq('source', source)
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
        .insert({ keyword: k.keyword, source, score: k.count });
      if (insErr) {
        failed++;
        console.warn(`  insert failed for "${k.keyword}":`, insErr.message);
      } else {
        inserted++;
      }
    }
  }

  log(`✅ [${source}] inserted=${inserted}, updated=${updated}, failed=${failed}`);
}

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  for (const { source, categoryId } of SOURCES) {
    try {
      await refreshOneSource(source, categoryId);
    } catch (e) {
      console.error(`[${source}] refresh failed (continuing other sources):`, e instanceof Error ? e.message : e);
    }
  }

  log('Done.');
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
