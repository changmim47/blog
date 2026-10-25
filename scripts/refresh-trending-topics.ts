/**
 * 오늘의 기둥(seed-keywords.ts의 pillarOrderForToday, generate-post와 같은 함수) 검색어로
 * 최근 7일 YouTube 한국 영상을 조회수 순으로 가져와, 오늘 기둥에 맞는 것만 trending_topics에 pillar와 함께 적재.
 *
 * 2026-08-31 이전에는 전체 카테고리를 무필터 적재해서 드라마·예능 글이 늘고
 * 주제 집중도(topical authority)가 희석됐다 → LLM 분류 필터 추가.
 * 2026-10-25 전체 카테고리 인기 급상승 → 오늘 기둥 검색으로 변경. 인기 급상승은 AI·연예 쏠림이라
 * 트렌딩 경로가 매일 쓰이면 기둥 순환이 무력화됐다.
 *
 * generate-post가 우선순위 chain (manual → trending → autocomplete)에서
 * trending_topics의 pending row 중 오늘 기둥(pillar) 것을 claim해 그 영상 기반으로 글을 작성함.
 */

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { pillarOrderForToday, type SEED_PILLARS } from './seed-keywords';

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

// 이름은 인기 급상승 시절 그대로 둔다 — (video_id, source) unique로 예전에 적재된 영상이 다시 들어오지 않게.
const SOURCE = 'youtube_trending_kr_all';
const MAX_RESULTS_PER_QUERY = 25;
const LOOKBACK_DAYS = 7;

// 기둥별 검색어. 검색어 1개 = youtube-analyze 1회(search.list + videos.list). 하루에 오늘 기둥 것만 호출.
// youtube-analyze search는 order=viewCount 고정이라 "최근 7일 중 조회수 상위"가 된다(급상승과는 다름).
const TRENDING_QUERIES: Record<keyof typeof SEED_PILLARS, string[]> = {
  'AI·테크': ['인공지능', '챗GPT'],
  과학: ['과학', '우주'],
  '경제·금융': ['경제 전망', '금리'],
  교육: ['공부법', '입시'],
};
// 50개 제목 분류는 기계적인 작업이라 저렴한 모델로 충분.
const CLASSIFY_MODEL = process.env.ANTHROPIC_MODEL_CLASSIFY || 'claude-haiku-4-5-20251001';

interface AnalyzedVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  viewCount: number;
}

/**
 * 검색 영상 목록에서 오늘 기둥 주제로 발전 가능한 것만 남긴다.
 * 실패 시(키 없음, API 오류) 빈 배열 반환 — 그날 트렌딩 적재를 건너뛰어도
 * generate-post의 autocomplete fallback이 글 생성을 커버하므로 fail-closed가 안전하다.
 * (fail-open이면 연예·예능이 조용히 다시 흘러들어온다.)
 */
async function filterByPillar(videos: AnalyzedVideo[], pillar: string): Promise<AnalyzedVideo[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log('  ⚠️  ANTHROPIC_API_KEY not set — skipping trending ingest (autocomplete fallback will cover)');
    return [];
  }
  const client = new Anthropic({ apiKey });
  const listing = videos.map((v, i) => `${i}. [${v.channelTitle ?? '?'}] ${v.title}`).join('\n');

  try {
    const res = await client.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 1024,
      tools: [
        {
          name: 'submit_selection',
          description: '블로그 글감으로 적합한 영상의 인덱스 목록 제출',
          input_schema: {
            type: 'object',
            required: ['selected_indices'],
            properties: {
              selected_indices: { type: 'array', items: { type: 'integer' } },
            },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_selection' },
      messages: [
        {
          role: 'user',
          content: `다음은 "${pillar}" 관련 검색어로 찾은 최근 7일 YouTube 한국 인기 영상 목록입니다.
이 블로그는 오늘 "${pillar}" 주제 글만 씁니다.

"${pillar}" 정보 글로 발전시킬 수 있는 "정보성 글감"이 되는 영상의 인덱스만 고르세요.
- 제외: 연예·드라마·예능·음악·게임·스포츠·먹방·브이로그·단순 사건사고·정치 공방
- 제외: 다른 주제(과학 / AI·테크 / 경제·금융 / 교육 중 "${pillar}"가 아닌 것)가 중심인 영상
- 판단 기준: "이 영상을 계기로 ${pillar} 정보 글을 쓸 수 있는가?" 애매하면 제외.
- 해당 없으면 빈 배열 제출.

${listing}`,
        },
      ],
    });

    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('no tool_use block in classify response');
    const raw = (block.input as { selected_indices?: unknown }).selected_indices;
    const set = new Set(Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : []);
    return videos.filter((_, i) => set.has(i));
  } catch (e) {
    log(`  ⚠️  Pillar classification failed (${e instanceof Error ? e.message : e}) — skipping today's ingest`);
    return [];
  }
}

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  const pillar = pillarOrderForToday()[0];
  const publishedAfter = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  log(`📅 Today's pillar: ${pillar}`);

  // 검색어끼리 겹치는 영상은 하나만 남긴다.
  const byId = new Map<string, AnalyzedVideo>();
  for (const keyword of TRENDING_QUERIES[pillar]) {
    log(`Invoking youtube-analyze (search "${keyword}", last ${LOOKBACK_DAYS} days, maxResults=${MAX_RESULTS_PER_QUERY})...`);
    const { data, error } = await supabase.functions.invoke('youtube-analyze', {
      body: { mode: 'search', keyword, publishedAfter, maxResults: MAX_RESULTS_PER_QUERY },
    });
    if (error) throw new Error(`youtube-analyze failed: ${error.message}`);
    if (!data || !Array.isArray(data.videos)) {
      throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
    }
    for (const v of data.videos as AnalyzedVideo[]) byId.set(v.id, v);
    log(`  ✓ Got ${data.videos.length} videos`);
  }
  const videos = [...byId.values()];

  const fits = await filterByPillar(videos, pillar);
  log(`  ✓ Pillar filter (${pillar}): ${videos.length} → ${fits.length} videos`);

  // 같은 video_id+source가 이미 있으면 (used/failed/pending 무관) 무시.
  // 매일 같은 영상이 트렌딩에 또 잡혀도 다시 글 쓰진 않음 — 중복 글 방지.
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const v of fits) {
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
        pillar,
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
