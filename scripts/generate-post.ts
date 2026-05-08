import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { SEED_KEYWORDS } from './seed-keywords';
import {
  callAgent,
  MARKETING_SCHEMA,
  OPERATIONS_SCHEMA,
  QA_SCHEMA,
  shouldApproveDespiteAmbiguity,
  type MarketingOutput,
  type OperationsOutput,
  type QaOutput,
} from './agents';

dotenvConfig({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const ADMIN_EMAIL = process.env.SUPABASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPABASE_ADMIN_PASSWORD;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !GEMINI_API_KEY) {
  console.error('❌ Missing required env vars in .env.local:');
  if (!SUPABASE_URL) console.error('  - VITE_SUPABASE_URL');
  if (!SUPABASE_KEY) console.error('  - VITE_SUPABASE_KEY');
  if (!ADMIN_EMAIL) console.error('  - SUPABASE_ADMIN_EMAIL');
  if (!ADMIN_PASSWORD) console.error('  - SUPABASE_ADMIN_PASSWORD');
  if (!GEMINI_API_KEY) console.error('  - GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const AUTOCOMPLETE_DELAY_MS = 100;
const DEDUP_LOOKBACK_DAYS = 30;
const MAX_REVISIONS = 2;

// =========================== Autocomplete ===========================

interface SeedSuggestions {
  seed: string;
  suggestions: string[];
}

interface Candidate {
  seed: string;
  keyword: string;
  wordCount: number;
}

async function fetchAutocomplete(query: string): Promise<string[]> {
  try {
    const url = `https://www.google.com/complete/search?client=chrome&hl=ko&ie=utf-8&oe=utf-8&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const buffer = await res.arrayBuffer();
    const ct = res.headers.get('content-type') ?? '';
    const charsetMatch = ct.match(/charset=([^;]+)/i);
    const charset = (charsetMatch?.[1] ?? 'utf-8').trim().toLowerCase();

    let text: string;
    try {
      text = new TextDecoder(charset).decode(buffer);
    } catch {
      text = new TextDecoder('utf-8').decode(buffer);
    }

    const json = JSON.parse(text);
    const suggestions = json?.[1];
    return Array.isArray(suggestions)
      ? suggestions.filter((s: unknown): s is string => typeof s === 'string')
      : [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ⚠️  Autocomplete failed for "${query}": ${msg}`);
    return [];
  }
}

async function gatherSuggestions(): Promise<SeedSuggestions[]> {
  log(`Gathering autocomplete suggestions for ${SEED_KEYWORDS.length} seeds...`);
  const result: SeedSuggestions[] = [];
  let totalCount = 0;
  for (const seed of SEED_KEYWORDS) {
    const suggestions = await fetchAutocomplete(seed);
    result.push({ seed, suggestions });
    totalCount += suggestions.length;
    await new Promise((r) => setTimeout(r, AUTOCOMPLETE_DELAY_MS));
  }
  log(`  ✓ Collected ${totalCount} suggestions across ${result.length} seeds`);
  return result;
}

function buildCandidates(pool: SeedSuggestions[]): Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const { seed, suggestions } of pool) {
    for (const s of suggestions) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase() === seed.toLowerCase()) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const wordCount = trimmed.split(/\s+/).length;
      if (wordCount < 2) continue;
      candidates.push({ seed, keyword: trimmed, wordCount });
    }
  }
  return candidates;
}

// =========================== Deduplication ===========================

interface ExclusionList {
  titles: string[];
  keywords: string[];
}

async function fetchRecentTopics(daysBack: number): Promise<ExclusionList> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceMs = since.getTime();

  const { data: posts } = await supabase
    .from('posts')
    .select('title')
    .gte('createdAt', sinceMs)
    .order('createdAt', { ascending: false })
    .limit(100);

  const { data: runs } = await supabase
    .from('generation_runs')
    .select('keyword')
    .eq('status', 'success')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  return {
    titles: (posts ?? []).map((p) => p.title).filter((t): t is string => !!t),
    keywords: (runs ?? []).map((r) => r.keyword).filter((k): k is string => !!k),
  };
}

const normalizeForCompare = (s: string) => s.toLowerCase().replace(/\s+/g, '');

function filterDuplicateCandidates(
  candidates: Candidate[],
  exclusion: ExclusionList
): Candidate[] {
  const recentKeywordsNorm = new Set(exclusion.keywords.map(normalizeForCompare));
  const recentTitlesNorm = exclusion.titles.map(normalizeForCompare);

  return candidates.filter((c) => {
    const candNorm = normalizeForCompare(c.keyword);
    if (recentKeywordsNorm.has(candNorm)) return false;
    for (const recentNorm of recentKeywordsNorm) {
      if (recentNorm.length < 6) continue;
      if (candNorm.includes(recentNorm) || recentNorm.includes(candNorm)) return false;
    }
    for (const titleNorm of recentTitlesNorm) {
      if (candNorm.length >= 6 && titleNorm.includes(candNorm)) return false;
    }
    return true;
  });
}

// =========================== Telegram ===========================

interface NotifyOpts {
  success: boolean;
  keyword?: string;
  title?: string;
  postId?: string;
  errorMessage?: string;
  qaIssues?: { description: string; level: string }[];
  revisionCount?: number;
}

async function notifyTelegram(opts: NotifyOpts): Promise<void> {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return;

  const BLOG_URL = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');

  let text: string;
  if (opts.success) {
    const lines = [
      '✅ 새 블로그 초안 생성',
      '',
      `🔑 키워드: ${opts.keyword ?? '(unknown)'}`,
      `📝 제목: ${opts.title ?? '(unknown)'}`,
    ];
    if (opts.revisionCount && opts.revisionCount > 0) {
      lines.push(`🔄 QA 수정 ${opts.revisionCount}회 후 통과`);
    }
    if (BLOG_URL && opts.postId) {
      lines.push('', `📄 검토: ${BLOG_URL}/p/${opts.postId}`);
      lines.push(`📋 모든 초안: ${BLOG_URL}/drafts`);
    } else if (opts.postId) {
      lines.push('', `Post ID: ${opts.postId}`);
    }
    text = lines.join('\n');
  } else {
    const lines = ['❌ 블로그 초안 생성 실패', ''];
    if (opts.keyword) lines.push(`🔑 키워드: ${opts.keyword}`);
    if (opts.errorMessage) lines.push(`💬 ${opts.errorMessage}`);
    if (opts.qaIssues && opts.qaIssues.length > 0) {
      lines.push('', 'QA 코멘트:');
      opts.qaIssues.slice(0, 5).forEach((i) => {
        lines.push(`- [${i.level}] ${i.description}`);
      });
    }
    if (BLOG_URL) {
      lines.push('', `📋 실행 기록: ${BLOG_URL}/admin/runs`);
    }
    text = lines.join('\n');
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
      console.warn(`Telegram notify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.warn('Telegram notify failed:', e instanceof Error ? e.message : String(e));
  }
}

// =========================== Run Recording ===========================

async function recordFailure(
  errorMessage: string,
  keyword: string | null = null,
  topic: string | null = null,
  trendsRaw: unknown = null
) {
  try {
    await supabase.from('generation_runs').insert({
      status: 'failed',
      keyword,
      topic,
      error_message: errorMessage,
      trends_raw: trendsRaw,
    });
  } catch (e) {
    console.error('Could not record failure:', e);
  }
}

// =========================== Agent Calls ===========================

async function runMarketing(
  candidates: Candidate[],
  exclusion: ExclusionList
): Promise<MarketingOutput> {
  const top = candidates.slice(0, 50);
  const candidatesText = top
    .map((c, i) => `${i + 1}. ${c.keyword} (시드: ${c.seed})`)
    .join('\n');

  const exclusionText =
    exclusion.titles.length > 0 || exclusion.keywords.length > 0
      ? `

[회피 - 최근 ${DEDUP_LOOKBACK_DAYS}일 글 제목 / 사용 키워드]
제목:
${exclusion.titles.slice(0, 30).map((t, i) => `${i + 1}. ${t}`).join('\n') || '(없음)'}

키워드:
${exclusion.keywords.slice(0, 30).map((k, i) => `${i + 1}. ${k}`).join('\n') || '(없음)'}`
      : '';

  const userPrompt = `[후보 키워드 ${top.length}개]
${candidatesText}${exclusionText}`;

  log('🎯 Marketing agent — selecting topic...');
  const result = await callAgent<MarketingOutput>({
    agentName: 'marketing',
    userPrompt,
    responseSchema: MARKETING_SCHEMA,
    log,
  });
  log(`  ✓ Marketing selected: "${result.selected_keyword}"`);
  log(`  ✓ Angle: ${result.angle.slice(0, 100)}${result.angle.length > 100 ? '...' : ''}`);
  return result;
}

async function runOperations(
  marketing: MarketingOutput,
  revision?: { previousDraft: OperationsOutput; qaFeedback: QaOutput }
): Promise<OperationsOutput> {
  const briefingText = `[마케팅팀 브리핑]
- selected_keyword: ${marketing.selected_keyword}
- search_intent: ${marketing.search_intent}
- target_audience: ${marketing.target_audience}
- angle: ${marketing.angle}
- key_points:
${marketing.key_points.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}
- long_tail_variations: ${marketing.long_tail_variations?.join(', ') || '(없음)'}`;

  const revisionText = revision
    ? `

[이전 초안]
제목: ${revision.previousDraft.title}
요약: ${revision.previousDraft.summary}
본문:
${revision.previousDraft.content_markdown}

[QA 피드백 — 다음 이슈를 반영해 재작성]
${revision.qaFeedback.issues.map((i, idx) => `${idx + 1}. [${i.level}/${i.category}] ${i.description}\n   → 제안: ${i.suggestion ?? '(없음)'}`).join('\n')}

QA 종합 코멘트: ${revision.qaFeedback.overall_comment}

위 이슈를 반영하되, 잘 쓴 부분은 보존할 것. 전체를 갈아엎지 말 것.`
    : '';

  const userPrompt = briefingText + revisionText;

  if (revision) {
    log('✍️  Operations agent — revising draft...');
  } else {
    log('✍️  Operations agent — drafting...');
  }

  const result = await callAgent<OperationsOutput>({
    agentName: 'operations',
    userPrompt,
    responseSchema: OPERATIONS_SCHEMA,
    log,
  });
  log(`  ✓ Operations title: ${result.title}`);
  log(`  ✓ Body: ${result.content_markdown.length} chars, ${result.tags.length} tags`);
  return result;
}

async function runQa(operations: OperationsOutput): Promise<QaOutput> {
  const userPrompt = `[검토 대상 초안]
제목: ${operations.title}
요약: ${operations.summary}
태그: ${operations.tags.join(', ')}

본문:
${operations.content_markdown}

이미지 제안: ${JSON.stringify(operations.image_alt_suggestions ?? [])}
기술 메모: ${operations.technical_notes ?? '(없음)'}`;

  log('🔍 QA agent — reviewing draft...');
  const result = await callAgent<QaOutput>({
    agentName: 'qa',
    userPrompt,
    responseSchema: QA_SCHEMA,
    log,
  });
  log(`  ✓ QA verdict: ${result.approved ? 'APPROVED' : 'REJECTED'} (${result.severity}, ${result.issues.length} issues)`);
  if (result.overall_comment) {
    log(`  ✓ Comment: ${result.overall_comment.slice(0, 150)}${result.overall_comment.length > 150 ? '...' : ''}`);
  }
  return result;
}

// =========================== Main ===========================

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  // 1. Autocomplete pool + dedup
  const pool = await gatherSuggestions();
  const allCandidates = buildCandidates(pool);
  log(`Built ${allCandidates.length} unique candidates`);

  log(`Fetching recent topics (last ${DEDUP_LOOKBACK_DAYS} days) to avoid duplicates...`);
  const exclusion = await fetchRecentTopics(DEDUP_LOOKBACK_DAYS);
  log(`  ✓ ${exclusion.titles.length} recent posts, ${exclusion.keywords.length} recent keywords`);

  const candidates = filterDuplicateCandidates(allCandidates, exclusion);
  log(`Filtered out ${allCandidates.length - candidates.length}. ${candidates.length} candidates remain.`);

  if (candidates.length === 0) {
    throw new Error('No non-duplicate candidates available. Try expanding seed pool.');
  }

  // 2. Marketing agent
  const marketing = await runMarketing(candidates, exclusion);

  // 3. Operations + QA loop
  const agentTrace: Record<string, unknown> = { marketing };

  let draft = await runOperations(marketing);
  let qa = await runQa(draft);
  agentTrace.operations_v1 = draft;
  agentTrace.qa_v1 = qa;

  let revisionCount = 0;
  while (!shouldApproveDespiteAmbiguity(qa) && revisionCount < MAX_REVISIONS) {
    revisionCount++;
    log(`📝 Revision ${revisionCount}/${MAX_REVISIONS} requested by QA`);
    draft = await runOperations(marketing, { previousDraft: draft, qaFeedback: qa });
    qa = await runQa(draft);
    agentTrace[`operations_v${revisionCount + 1}`] = draft;
    agentTrace[`qa_v${revisionCount + 1}`] = qa;
  }

  const finalApproved = shouldApproveDespiteAmbiguity(qa);

  // 4. If finally rejected, record failure and notify
  if (!finalApproved) {
    log(`❌ QA rejected after ${MAX_REVISIONS} revisions. Not saving draft.`);
    await recordFailure(
      `QA rejected after ${MAX_REVISIONS} revisions: ${qa.overall_comment}`,
      marketing.selected_keyword,
      draft.title,
      {
        agents: agentTrace,
        revisionCount,
        finalQaIssues: qa.issues,
        pool,
      }
    );
    await notifyTelegram({
      success: false,
      keyword: marketing.selected_keyword,
      errorMessage: `QA가 ${MAX_REVISIONS}회 수정 후에도 거절`,
      qaIssues: qa.issues.map((i) => ({ description: i.description, level: i.level })),
    });
    process.exit(1);
  }

  // 5. Insert approved draft
  const postId = `auto-${Date.now()}`;
  const post = {
    id: postId,
    type: 'blog',
    title: draft.title,
    content: draft.content_markdown,
    summary: draft.summary,
    tags: draft.tags,
    createdAt: Date.now(),
    coverImage: `https://picsum.photos/800/400?random=${Date.now()}`,
    contentImages: [],
    audioUrl: '',
    likes: 0,
    published: false,
  };

  log('Inserting approved draft post...');
  const { error: postError } = await supabase.from('posts').insert(post);
  if (postError) throw new Error(`Insert post failed: ${postError.message}`);
  log(`✓ Inserted draft: ${postId}`);

  log('Recording generation run...');
  const { error: runError } = await supabase.from('generation_runs').insert({
    status: 'success',
    keyword: marketing.selected_keyword,
    topic: draft.title,
    post_id: postId,
    error_message: revisionCount > 0 ? `Approved after ${revisionCount} revision(s)` : null,
    trends_raw: {
      agents: agentTrace,
      revisionCount,
      pool,
    },
  });
  if (runError) throw new Error(`Insert run failed: ${runError.message}`);
  log('✓ Recorded run');

  log('');
  log(`✅ Done. Keyword: "${marketing.selected_keyword}". Check /drafts and /admin/runs.`);

  await notifyTelegram({
    success: true,
    keyword: marketing.selected_keyword,
    title: draft.title,
    postId,
    revisionCount,
  });
}

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${msg}`);
  await recordFailure(msg);
  await notifyTelegram({ success: false, errorMessage: msg });
  process.exit(1);
});
