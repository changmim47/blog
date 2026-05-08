import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { SEED_KEYWORDS } from './seed-keywords';

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
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

interface SeedSuggestions {
  seed: string;
  suggestions: string[];
}

interface Candidate {
  seed: string;
  keyword: string;
  wordCount: number;
}

const AUTOCOMPLETE_DELAY_MS = 100;
const DEDUP_LOOKBACK_DAYS = 30;

interface ExclusionList {
  titles: string[];   // 최근 글 제목 (drafts + published)
  keywords: string[]; // 최근 generation_runs에서 선정된 키워드
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

    // 완전 일치
    if (recentKeywordsNorm.has(candNorm)) return false;

    // 부분 일치 (의미 있는 길이 6자 이상일 때만)
    for (const recentNorm of recentKeywordsNorm) {
      if (recentNorm.length < 6) continue;
      if (candNorm.includes(recentNorm) || recentNorm.includes(candNorm)) return false;
    }

    // 제목과 부분 일치 — 제목은 더 길어서 더 엄격
    for (const titleNorm of recentTitlesNorm) {
      if (candNorm.length >= 6 && titleNorm.includes(candNorm)) return false;
    }

    return true;
  });
}

async function fetchAutocomplete(query: string): Promise<string[]> {
  try {
    // hl=ko 일 때 Google이 EUC-KR 로 응답할 수 있어서, 응답의 Content-Type charset을 읽고 그에 맞게 디코딩.
    // ie/oe=utf-8 도 같이 지정해 가능하면 UTF-8로 받도록 유도.
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
      // 혹시 Node가 해당 인코딩을 지원하지 않으면 UTF-8 폴백
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

// 후보 점수: 3~5단어 롱테일을 가장 선호 (SEO 스위트스팟)
// 같은 시드의 자기 자신과 동일한 추천은 제외
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
      if (wordCount < 2) continue; // 단일 단어는 경쟁이 너무 셈

      candidates.push({ seed, keyword: trimmed, wordCount });
    }
  }
  return candidates;
}

interface GeminiOutput {
  selected_keyword: string;
  reasoning: string;
  title: string;
  summary: string;
  tags: string[];
  content_markdown: string;
}

// 모델은 환경변수로 오버라이드 가능. free tier 할당량이 모델마다 달라서 막히면 다른 모델로 전환.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_CANDIDATES_FOR_PROMPT = 50;

async function generateWithGemini(
  candidates: Candidate[],
  pool: SeedSuggestions[],
  exclusion: ExclusionList
): Promise<GeminiOutput> {
  const top = candidates.slice(0, MAX_CANDIDATES_FOR_PROMPT);
  const candidatesText = top
    .map((c, i) => `${i + 1}. ${c.keyword} (시드: ${c.seed})`)
    .join('\n');

  const exclusionSection =
    exclusion.titles.length > 0 || exclusion.keywords.length > 0
      ? `

[중복 회피 - 절대 같은 주제로 작성하지 말 것]
아래는 최근 ${DEDUP_LOOKBACK_DAYS}일간 이미 작성된 글의 제목과 사용된 키워드입니다.
선정 키워드와 글 내용 모두 이들과 겹치면 안 됩니다.

▣ 최근 글 제목:
${exclusion.titles.slice(0, 30).map((t, i) => `${i + 1}. ${t}`).join('\n') || '(없음)'}

▣ 최근 사용된 키워드:
${exclusion.keywords.slice(0, 30).map((k, i) => `${i + 1}. ${k}`).join('\n') || '(없음)'}

위 목록과 다음 중 하나라도 해당되면 그 후보는 제외:
- 키워드가 의미적으로 동일/유사
- 같은 도구/개념의 같은 측면을 다룸 (예: "ChatGPT 구독취소"가 이미 있다면 "ChatGPT 결제 해지" 같은 사실상 같은 주제도 제외)
- 글 내용이 위 제목들과 겹칠 수밖에 없는 키워드

선정 후, 글 작성 시에도 위 제목들과 본문 내용/예시/구성이 겹치지 않게 새로운 각도로 작성할 것.`
      : '';

  const prompt = `당신은 한국어 SEO 블로그 작가입니다. Google 자동완성 후보 키워드에서 SEO 가치 있는 주제를 선정해 자연스러운 한국어 글을 씁니다.

[블로그 컨셉]
- 운영자: AI 비전공자가 AI 도구와 생태계를 직접 써보고 학습 과정을 정리하는 블로그
- 톤: 친근하고 솔직, 초보자 시점, 실용적이고 구체적
- 독자: AI에 관심 있지만 깊은 기술 지식은 없는 한국 사용자

[후보 키워드 ${top.length}개 - Google 자동완성, 시드별 표시]
${candidatesText}
${exclusionSection}

═══════════════════════════════════════════
작업 1. 키워드 선정
═══════════════════════════════════════════
위 후보 중 ONE을 선정. 기준:
- 검색 의도 명확 (사용법, 비교, 추천, 차이, 후기 등)
- 너무 일반적이지도 너무 좁지도 않은 롱테일 sweet spot
- 비전공자 시점에서 의미 있게 다룰 수 있는 주제

═══════════════════════════════════════════
작업 2. 글 작성 (SEO + 자연스러움 양쪽 만족)
═══════════════════════════════════════════

▣ 길이 (반드시 지킬 것)
본문 마크다운 본문 글자 수: 2000자 이상 3000자 이하
(마크다운 기호 ##, -, > 등은 글자 수에서 제외하고 한글/영문/숫자/공백만 셈)

▣ SEO - 키워드 배치 규칙
1. 선정 키워드를 제목 앞쪽 절반에 정확히 한 번 포함
2. 도입부 첫 80자 안에 키워드 한 번 포함 (즉답 형 도입으로 Featured Snippet 노림)
3. ## 헤딩 중 최소 2개에 키워드 또는 의미 변형(예: "ChatGPT 사용법" → "ChatGPT를 처음 쓰는 법") 포함
4. 본문 전체에서 키워드를 4~7회 자연스럽게 노출 (키워드 밀도 약 1~2%)
5. 같은 시드의 다른 자동완성 검색어를 LSI 키워드로 본문에 2~4개 자연스럽게 섞기

▣ SEO - 구조 규칙
1. 도입부 첫 단락(50~120자): 검색자의 질문에 즉시 답하는 한 두 문장. 줄거리 예고형 금지.
2. ## 헤딩으로 3~5개 섹션 분할, 각 섹션 400~700자
3. ### 서브헤딩은 꼭 필요한 곳에서만 (남발 금지)
4. 결론은 "정리"가 아닌 한두 줄의 솔직한 의견 또는 작은 제안으로 자연스럽게 마무리

▣ 자연스러움 - 절대 금지 (AI 티 나게 만드는 패턴)
- 마크다운 굵게(**) 일체 사용 금지
- 마크다운 기울임(*) 일체 사용 금지
- 이모지 사용 금지
- 정형화된 도입부 금지: "안녕하세요!", "오늘은 ~에 대해 알아보겠습니다", "~을 함께 살펴볼까요?", "여러분 ~"
- 마케팅 광고체 금지: "~인 점이 매력적입니다", "~할 수 있는 것이 큰 장점이에요", "강력 추천드려요!", "꼭 한번 사용해보세요!", "놓칠 수 없는"
- 정형화된 결론 금지: "지금까지 ~에 대해 알아봤습니다", "도움이 되셨길 바랍니다", "이상으로 ~", "행복하세요"
- 빈도부사 남용 금지: "정말", "너무", "꼭", "확실히", "단연" 등 한 글에 두 번 이상 X
- 모든 단락을 "또한", "더불어", "뿐만 아니라", "그리고" 같은 정형 접속사로 시작 X
- 표(table), 체크리스트, 비교 매트릭스 남발 X (한 글에 최대 1개)
- 전부 같은 길이의 문단 X

▣ 자연스러움 - 권장
- 문어체("~합니다") 7할, 친근체("~이에요", "~죠") 3할 정도로 섞어 단조로움 회피
- 문단 길이 다양화: 긴 단락 사이에 한 줄짜리 단락 가끔
- 비전공자가 직접 써본 듯한 구체적 묘사 — 클릭 횟수, 시행착오, 헷갈렸던 부분, 작은 깨달음
- 가끔 짧은 자문자답("그럼 단점은? 사실 있다.") 또는 의문문으로 호흡 조절
- 마크다운 사용 가능 요소: ## H2, ### H3, - 불릿, 1. 번호, > 인용 — 이 다섯 가지만 사용

▣ 기타
- 외부 URL 링크 작성 금지 (환각 방지)
- 모르는 사실 만들어내지 말 것 — 일반론과 본인 시점의 추측을 명확히 구분

═══════════════════════════════════════════
출력
═══════════════════════════════════════════
JSON 스키마 정확히 따를 것. 모든 값 한국어. content_markdown 글자 수 2000~3000자.

- title: 자연스러운 한국어 제목, 키워드 포함, 30~50자
- summary: 150자 이내 메타 디스크립션 (검색결과 미리보기에 그대로 노출됨)
- tags: 3~6개 한국어 태그
- content_markdown: 본문 (위 규칙 모두 준수)
- selected_keyword: 후보 풀에서 선정한 키워드 정확히 그대로
- reasoning: 왜 이 키워드를 선정했는지 1~2문장`;

  log('Calling Gemini for keyword selection + content generation...');

  const requestConfig = {
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      // 한국어 본문 2000~3000자 + 메타 필드 합쳐 토큰으로 ~10000 정도. 여유 있게.
      maxOutputTokens: 16384,
      // gemini-2.5-flash는 기본으로 thinking이 켜져 있어 output 예산을 잡아먹음. 끄면 본문에 더 많이 쓸 수 있음.
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        required: ['selected_keyword', 'reasoning', 'title', 'summary', 'tags', 'content_markdown'],
        properties: {
          selected_keyword: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          content_markdown: { type: Type.STRING },
        },
      },
    },
  };

  // Gemini가 일시적 과부하(503) 또는 분당 한도(429)로 실패할 수 있으므로 점진적 backoff 재시도.
  const MAX_ATTEMPTS = 4;
  const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

  let response;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await ai.models.generateContent(requestConfig);
      break;
    } catch (e) {
      lastError = e;
      const errStr = e instanceof Error ? e.message : String(e);
      const isRetryable =
        errStr.includes('503') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('overloaded') ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED');

      if (!isRetryable || attempt === MAX_ATTEMPTS) throw e;

      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 30_000;
      log(`  ⚠️  Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${errStr.slice(0, 120)}`);
      log(`     Retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!response) throw lastError ?? new Error('Gemini call failed without a response');

  const text = response.text;
  if (!text) throw new Error('Gemini returned empty response');

  // 응답이 토큰 한도에 걸려 잘렸는지 확인 (잘리면 JSON 파싱 실패하거나 본문이 중간에 끝남)
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini response did not finish cleanly (finishReason=${finishReason}). Try increasing maxOutputTokens or shortening the prompt.`);
  }

  let parsed: GeminiOutput;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON response: ${(e as Error).message}\nRaw: ${text.slice(0, 500)}`);
  }

  if (!parsed.title || !parsed.content_markdown || !parsed.selected_keyword) {
    throw new Error(`Gemini response missing required fields. Got: ${Object.keys(parsed).join(', ')}`);
  }

  log(`  ✓ Gemini selected: "${parsed.selected_keyword}"`);
  log(`  ✓ Reasoning: ${parsed.reasoning.slice(0, 120)}${parsed.reasoning.length > 120 ? '...' : ''}`);
  log(`  ✓ Title: ${parsed.title}`);
  log(`  ✓ Body: ${parsed.content_markdown.length} chars, ${parsed.tags.length} tags`);

  return parsed;
}

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

interface NotifyOpts {
  success: boolean;
  keyword?: string;
  title?: string;
  postId?: string;
  errorMessage?: string;
}

async function notifyTelegram(opts: NotifyOpts): Promise<void> {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return; // 알림 미설정 시 그냥 스킵

  const BLOG_URL = (process.env.BLOG_BASE_URL ?? '').replace(/\/$/, '');

  let text: string;
  if (opts.success) {
    const lines = [
      '✅ 새 블로그 초안 생성',
      '',
      `🔑 키워드: ${opts.keyword ?? '(unknown)'}`,
      `📝 제목: ${opts.title ?? '(unknown)'}`,
    ];
    if (BLOG_URL && opts.postId) {
      lines.push('', `📄 검토: ${BLOG_URL}/p/${opts.postId}`);
      lines.push(`📋 모든 초안: ${BLOG_URL}/drafts`);
    } else if (opts.postId) {
      lines.push('', `Post ID: ${opts.postId}`);
    }
    text = lines.join('\n');
  } else {
    text = `❌ 블로그 초안 생성 실패\n\n${opts.errorMessage ?? 'Unknown error'}`;
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

async function main() {
  log('Signing in as admin...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  log('✓ Signed in');

  const pool = await gatherSuggestions();
  const allCandidates = buildCandidates(pool);
  log(`Built ${allCandidates.length} unique candidates after dedup/filter`);

  log(`Fetching recent post topics (last ${DEDUP_LOOKBACK_DAYS} days) to avoid duplicates...`);
  const exclusion = await fetchRecentTopics(DEDUP_LOOKBACK_DAYS);
  log(`  ✓ Found ${exclusion.titles.length} recent posts, ${exclusion.keywords.length} recent keywords`);

  const candidates = filterDuplicateCandidates(allCandidates, exclusion);
  log(`Filtered out ${allCandidates.length - candidates.length} candidates overlapping with recent posts. ${candidates.length} remain.`);

  if (candidates.length === 0) {
    throw new Error('No non-duplicate candidates available. Try expanding seed pool or wait until older posts roll off.');
  }

  const generated = await generateWithGemini(candidates, pool, exclusion);

  const postId = `auto-${Date.now()}`;
  const post = {
    id: postId,
    type: 'blog',
    title: generated.title,
    content: generated.content_markdown,
    summary: generated.summary,
    tags: generated.tags,
    createdAt: Date.now(),
    coverImage: `https://picsum.photos/800/400?random=${Date.now()}`,
    contentImages: [],
    audioUrl: '',
    likes: 0,
    published: false,
  };

  log('Inserting draft post...');
  const { error: postError } = await supabase.from('posts').insert(post);
  if (postError) throw new Error(`Insert post failed: ${postError.message}`);
  log(`✓ Inserted draft post: ${postId}`);

  log('Recording generation run...');
  const { error: runError } = await supabase.from('generation_runs').insert({
    status: 'success',
    keyword: generated.selected_keyword,
    topic: generated.title,
    post_id: postId,
    error_message: null,
    trends_raw: {
      gemini_reasoning: generated.reasoning,
      total_candidates: candidates.length,
      pool,
    },
  });
  if (runError) throw new Error(`Insert run failed: ${runError.message}`);
  log('✓ Recorded run');

  log('');
  log(`✅ Done. Keyword: "${generated.selected_keyword}". Check /drafts and /admin/runs.`);

  await notifyTelegram({
    success: true,
    keyword: generated.selected_keyword,
    title: generated.title,
    postId,
  });
}

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${msg}`);
  await recordFailure(msg);
  await notifyTelegram({ success: false, errorMessage: msg });
  process.exit(1);
});
