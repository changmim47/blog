/**
 * YouTube 한국 인기 급상승(전체 카테고리)에서 영상 메타데이터를 가져와
 * 블로그 네 기둥(과학 / AI·테크 / 경제 / 교육)에 맞는 것만 trending_topics에 적재.
 *
 * 2026-08-31 이전에는 전체 카테고리를 무필터 적재해서 드라마·예능 글이 늘고
 * 주제 집중도(topical authority)가 희석됐다 → LLM 분류 필터 추가.
 *
 * generate-post가 우선순위 chain (manual → trending → autocomplete)에서
 * trending_topics의 pending row를 claim해 그 영상 기반으로 글을 작성함.
 */

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

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

// 블로그 네 기둥. marketing.md / seed-keywords.ts와 함께 관리할 것.
const PILLARS = '과학, AI·테크, 경제·금융, 교육';
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
 * 인기 영상 목록에서 네 기둥 주제로 발전 가능한 것만 남긴다.
 * 실패 시(키 없음, API 오류) 빈 배열 반환 — 그날 트렌딩 적재를 건너뛰어도
 * generate-post의 autocomplete fallback이 글 생성을 커버하므로 fail-closed가 안전하다.
 * (fail-open이면 연예·예능이 조용히 다시 흘러들어온다.)
 */
async function filterByPillars(videos: AnalyzedVideo[]): Promise<AnalyzedVideo[]> {
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
          content: `다음은 오늘 YouTube 한국 인기 급상승 영상 목록입니다.
이 블로그는 ${PILLARS} 네 주제만 다룹니다.

네 주제 중 하나로 발전시킬 수 있는 "정보성 글감"이 되는 영상의 인덱스만 고르세요.
- 제외: 연예·드라마·예능·음악·게임·스포츠·먹방·브이로그·단순 사건사고·정치 공방
- 판단 기준: "이 영상을 계기로 과학/AI/경제/교육 정보 글을 쓸 수 있는가?" 애매하면 제외.
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

  const fits = await filterByPillars(videos);
  log(`  ✓ Pillar filter (${PILLARS}): ${videos.length} → ${fits.length} videos`);

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
