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
import { TelegramReporter } from './telegram';

dotenvConfig({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY;
const ADMIN_EMAIL = process.env.SUPABASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SUPABASE_ADMIN_PASSWORD;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !ANTHROPIC_API_KEY) {
  console.error('❌ Missing required env vars in .env.local:');
  if (!SUPABASE_URL) console.error('  - VITE_SUPABASE_URL');
  if (!SUPABASE_KEY) console.error('  - VITE_SUPABASE_KEY');
  if (!ADMIN_EMAIL) console.error('  - SUPABASE_ADMIN_EMAIL');
  if (!ADMIN_PASSWORD) console.error('  - SUPABASE_ADMIN_PASSWORD');
  if (!ANTHROPIC_API_KEY) console.error('  - ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const AUTOCOMPLETE_DELAY_MS = 100;
const DEDUP_LOOKBACK_DAYS = 30;
const MAX_REVISIONS = 2;

// 모든 에이전트 호출에 prepend되는 현재 시점 정보.
// LLM은 학습 시점을 기본 가정하므로 명시적으로 주입해야 작년 데이터를 최신으로 오인하지 않음.
function buildCurrentContext(): string {
  const now = new Date();
  const koreanDate = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const isoDate = now.toISOString().split('T')[0];
  const year = now.getFullYear();
  return `[현재 시점 정보 — 반드시 이 기준으로 작성]
- 오늘 날짜: ${koreanDate} (${isoDate})
- 현재 연도: ${year}년
- 글에 등장하는 모든 시간/날짜 관련 표현 ("최근", "올해", "현재", "작년", "지난달", "이번 분기" 등)은 위 날짜를 기준으로 작성할 것
- 학습 데이터의 시점(예: 2024년)을 기준 삼지 말 것
- 정확히 모르는 최신 통계/이벤트/버전은 추측하지 말고 시점 언급을 피하거나 "최근", "현재" 같이 모호하게 쓸 것
- 출시 연도, 가격, 정책 등 시간에 민감한 사실을 단정하기 어렵다면 "${year}년 기준" 같은 한정어 사용 또는 일반론으로 우회

`;
}

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

// =========================== Unsplash Cover Image ===========================

async function fetchUnsplashImage(query: string): Promise<string | null> {
  const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!ACCESS_KEY) {
    log('  ℹ️  UNSPLASH_ACCESS_KEY not set, skipping Unsplash');
    return null;
  }
  if (!query || !query.trim()) return null;

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=1&content_filter=high`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${ACCESS_KEY}` },
    });
    if (!res.ok) {
      console.warn(`Unsplash HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { results?: Array<{ urls?: { regular?: string } }> };
    const first = json.results?.[0];
    return first?.urls?.regular ?? null;
  } catch (e) {
    console.warn('Unsplash fetch failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function pickCoverImage(query: string): Promise<string> {
  log(`📸 Fetching cover image: "${query}"`);
  const unsplashUrl = await fetchUnsplashImage(query);
  if (unsplashUrl) {
    log(`  ✓ Unsplash matched`);
    return unsplashUrl;
  }
  log(`  ⚠️  Unsplash returned no result — falling back to picsum`);
  return `https://picsum.photos/800/400?random=${Date.now()}`;
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

  const userPrompt = `${buildCurrentContext()}[후보 키워드 ${top.length}개]
${candidatesText}${exclusionText}`;

  log('🎯 Marketing agent — selecting topic...');
  const result = await callAgent<MarketingOutput>({
    agentName: 'marketing',
    userPrompt,
    toolName: 'submit_marketing_brief',
    toolDescription: '선정한 키워드와 업무팀 브리핑을 제출',
    inputSchema: MARKETING_SCHEMA,
    webSearchMaxUses: 2, // 트렌드/최신성 가볍게 확인
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

  const userPrompt = buildCurrentContext() + briefingText + revisionText;

  if (revision) {
    log('✍️  Operations agent — revising draft...');
  } else {
    log('✍️  Operations agent — drafting...');
  }

  const result = await callAgent<OperationsOutput>({
    agentName: 'operations',
    userPrompt,
    toolName: 'submit_blog_draft',
    toolDescription: '완성된 블로그 초안을 제출',
    inputSchema: OPERATIONS_SCHEMA,
    webSearchMaxUses: 5, // 본문 작성 — 최신 가격/모델/정책 확인 위해 충분히
    log,
  });
  log(`  ✓ Operations title: ${result.title}`);
  log(`  ✓ Body: ${result.content_markdown.length} chars, ${result.tags.length} tags`);
  return result;
}

async function runQa(operations: OperationsOutput): Promise<QaOutput> {
  const userPrompt = `${buildCurrentContext()}[검토 대상 초안]
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
    toolName: 'submit_qa_review',
    toolDescription: '품질관리팀의 검토 결과를 제출',
    inputSchema: QA_SCHEMA,
    log,
  });
  log(`  ✓ QA verdict: ${result.approved ? 'APPROVED' : 'REJECTED'} (${result.severity}, ${result.issues.length} issues)`);
  if (result.overall_comment) {
    log(`  ✓ Comment: ${result.overall_comment.slice(0, 150)}${result.overall_comment.length > 150 ? '...' : ''}`);
  }
  return result;
}

// =========================== Main ===========================

const reporter = new TelegramReporter();

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  // 진행 메시지 시작
  await reporter.start();
  await reporter.update({ marketing: { status: 'in-progress' } });

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
  await reporter.update({
    marketing: { status: 'done', keyword: marketing.selected_keyword, intent: marketing.search_intent },
    operations: { status: 'in-progress', revisionAttempt: 1 },
  });

  // 3. Operations + QA loop
  const agentTrace: Record<string, unknown> = { marketing };

  let draft = await runOperations(marketing);
  agentTrace.operations_v1 = draft;
  await reporter.update({
    operations: {
      status: 'done',
      chars: draft.content_markdown.length,
      tags: draft.tags.length,
      revisionAttempt: 1,
    },
    qa: { status: 'in-progress', attempt: 1 },
  });

  let qa = await runQa(draft);
  agentTrace.qa_v1 = qa;

  const revisionHistory: { qaSummary: string; majorCount: number }[] = [];
  let revisionCount = 0;

  while (!shouldApproveDespiteAmbiguity(qa) && revisionCount < MAX_REVISIONS) {
    revisionCount++;
    const majorCount = qa.issues.filter((i) => i.level === 'major').length;
    const minorCount = qa.issues.filter((i) => i.level === 'minor').length;

    // 이전 시도를 history에 기록하고, 새 revision 진행 상태로 업데이트
    revisionHistory.push({
      qaSummary: `(${majorCount} major / ${minorCount} minor)`,
      majorCount,
    });

    await reporter.update({
      qa: {
        status: 'done',
        approved: false,
        majorIssueCount: majorCount,
        minorIssueCount: minorCount,
        comment: qa.overall_comment,
        attempt: revisionCount,
      },
      revisionHistory: [...revisionHistory],
      operations: { status: 'in-progress', revisionAttempt: revisionCount + 1 },
    });

    log(`📝 Revision ${revisionCount}/${MAX_REVISIONS} requested by QA`);
    draft = await runOperations(marketing, { previousDraft: draft, qaFeedback: qa });
    agentTrace[`operations_v${revisionCount + 1}`] = draft;

    await reporter.update({
      operations: {
        status: 'done',
        chars: draft.content_markdown.length,
        tags: draft.tags.length,
        revisionAttempt: revisionCount + 1,
      },
      qa: { status: 'in-progress', attempt: revisionCount + 1 },
    });

    qa = await runQa(draft);
    agentTrace[`qa_v${revisionCount + 1}`] = qa;
  }

  const finalApproved = shouldApproveDespiteAmbiguity(qa);
  const finalMajorCount = qa.issues.filter((i) => i.level === 'major').length;
  const finalMinorCount = qa.issues.filter((i) => i.level === 'minor').length;

  // QA 최종 결과 반영
  await reporter.update({
    qa: {
      status: 'done',
      approved: finalApproved,
      severity: qa.severity,
      majorIssueCount: finalMajorCount,
      minorIssueCount: finalMinorCount,
      comment: qa.overall_comment,
      attempt: revisionCount + 1,
    },
  });

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
    await reporter.update({
      final: {
        outcome: 'rejected',
        qaIssues: qa.issues.map((i) => ({ description: i.description, level: i.level })),
        totalRevisions: revisionCount,
      },
    });
    process.exit(1);
  }

  // 5. Cover image (Unsplash → fallback picsum)
  const coverImage = await pickCoverImage(marketing.cover_image_query);

  // 6. Insert approved draft
  const postId = `auto-${Date.now()}`;
  const post = {
    id: postId,
    type: 'blog',
    title: draft.title,
    content: draft.content_markdown,
    summary: draft.summary,
    tags: draft.tags,
    createdAt: Date.now(),
    coverImage,
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

  await reporter.update({
    final: {
      outcome: 'approved',
      postId,
      totalRevisions: revisionCount,
    },
  });
}

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${msg}`);
  await recordFailure(msg);
  await reporter.sendSimpleError(msg);
  process.exit(1);
});
