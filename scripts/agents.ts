import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '..', 'agents');

// 환경변수로 모델 변경 가능 (예: claude-haiku-4-5, claude-opus-5)
// 본문(marketing/operations)은 최신 세대, QA는 다른 모델로 분리한다 —
// 같은 모델이 자기 글을 검수하면 쓰면서 못 느낀 문제를 검수에서도 못 잡는다
// (실제로 summary 150자 규칙이 같은-모델 QA를 10/47건 통과했다).
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ANTHROPIC_MODEL_QA = process.env.ANTHROPIC_MODEL_QA || 'claude-sonnet-4-6';

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const MAX_ATTEMPTS = 4;
// Ops 1회 추정 1.5~3분. 막힌 요청은 5분에 끊고 아래 수동 재시도로 한 번 더 보낸다 (잡 timeout 20분).
const REQUEST_TIMEOUT_MS = 5 * 60_000;
// 서버 도구(web_search) 루프가 pause_turn으로 끊기면 이어 받는 최대 횟수
const MAX_PAUSE_CONTINUES = 2;
// content 끝 "관련 자료"에 붙일 web_search 출처 최대 개수
const MAX_SOURCES = 5;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
    // SDK 기본 재시도(2회)는 아래 수동 재시도와 겹치므로 끈다.
    _client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
  }
  return _client;
}

const promptCache = new Map<string, string>();
async function loadAgentPrompt(name: 'marketing' | 'operations' | 'qa'): Promise<string> {
  if (promptCache.has(name)) return promptCache.get(name)!;
  const filepath = path.join(AGENTS_DIR, `${name}.md`);
  const content = await readFile(filepath, 'utf-8');
  promptCache.set(name, content);
  return content;
}

// 에이전트별 max_tokens
// - marketing/qa: 짧은 JSON (1~2k)이라 4096 충분
// - operations: 한국어 본문 ~3000자 + 메타 = ~6~8k 출력 → 여유 있게 16384
const DEFAULT_MAX_TOKENS: Record<string, number> = {
  marketing: 4096,
  operations: 16384,
  qa: 4096,
};

interface CallAgentOptions {
  agentName: 'marketing' | 'operations' | 'qa';
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  /**
   * web_search 도구 활성화 + 최대 사용 횟수.
   * undefined/0이면 비활성. 활성 시 에이전트가 최신 정보를 실시간 검색 가능.
   * 비용: $10/1000 searches ≈ $0.01/search.
   */
  webSearchMaxUses?: number;
  /** 주면 web_search 인용·결과 URL을 여기에 모은다 (중복 제거, 최대 MAX_SOURCES개). 여러 호출에 같은 배열을 넘기면 누적. */
  sources?: Source[];
  log?: (msg: string) => void;
}

export interface Source {
  title: string;
  url: string;
}

/**
 * 응답 블록에서 출처를 모은다. 실제 인용된 것(text 블록 citations)을 먼저,
 * 그다음 검색 결과를 검색마다 1위부터 번갈아 넣는다 (첫 검색 결과로만 칸이 차지 않게).
 */
export function collectSources(blocks: Anthropic.Messages.ContentBlock[], sources: Source[]): void {
  const add = (title: string | null, url: string) => {
    if (sources.length >= MAX_SOURCES || sources.some((s) => s.url === url)) return;
    sources.push({ title: title || url, url });
  };
  for (const b of blocks) {
    if (b.type !== 'text') continue;
    for (const c of b.citations ?? []) {
      if (c.type === 'web_search_result_location') add(c.title, c.url);
    }
  }
  const resultLists = blocks.flatMap((b) =>
    b.type === 'web_search_tool_result' && Array.isArray(b.content) ? [b.content] : []
  );
  const longest = Math.max(0, ...resultLists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const l of resultLists) if (i < l.length) add(l[i].title, l[i].url);
  }
}

export async function callAgent<T = unknown>(opts: CallAgentOptions): Promise<T> {
  const { agentName, userPrompt, toolName, toolDescription, inputSchema, webSearchMaxUses, sources, log } = opts;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS[agentName] ?? 4096;
  const systemInstruction = await loadAgentPrompt(agentName);
  const client = getClient();

  // 도구 구성: 항상 custom output 도구 + 선택적으로 web_search
  const tools: Anthropic.Messages.ToolUnion[] = [
    {
      name: toolName,
      description: toolDescription,
      input_schema: inputSchema as Anthropic.Messages.Tool.InputSchema,
    },
  ];
  if (webSearchMaxUses && webSearchMaxUses > 0) {
    tools.push({
      type: 'web_search_20260209',
      name: 'web_search',
      max_uses: webSearchMaxUses,
    } as unknown as Anthropic.Messages.ToolUnion);
  }

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userPrompt }];
  const requestParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: agentName === 'qa' ? ANTHROPIC_MODEL_QA : ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system: systemInstruction,
    tools,
    // web_search 활성 시 'auto'로 두어야 모델이 검색 후 custom tool 호출 가능.
    // 비활성 시 강제 호출로 안정성 확보.
    tool_choice: webSearchMaxUses ? { type: 'auto' } : { type: 'tool', name: toolName },
    messages,
  };

  let response: Anthropic.Messages.Message | undefined;
  let searchCount = 0;

  // pause_turn이면 받은 내용을 assistant 턴으로 붙여 같은 요청을 이어 보낸다.
  for (let turn = 0; ; turn++) {
    response = undefined;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await client.messages.create(requestParams);
        break;
      } catch (e) {
        lastError = e;
        const errStr = e instanceof Error ? e.message : String(e);
        // Anthropic 재시도 가능 에러: 429 rate_limit, 529 overloaded, 5xx server errors
        const isRetryable =
          errStr.includes('429') ||
          errStr.includes('rate_limit') ||
          errStr.includes('529') ||
          errStr.includes('overloaded') ||
          errStr.includes('Overloaded') ||
          errStr.includes('500') ||
          errStr.includes('502') ||
          errStr.includes('503') ||
          errStr.includes('504') ||
          errStr.includes('timed out');

        if (!isRetryable || attempt === MAX_ATTEMPTS) throw e;

        const delay = RETRY_DELAYS_MS[attempt - 1] ?? 30_000;
        log?.(`  ⚠️  [${agentName}] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${errStr.slice(0, 120)}`);
        log?.(`     retrying in ${Math.round(delay / 1000)}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (!response) throw lastError ?? new Error(`[${agentName}] call failed`);

    searchCount += response.content.filter((b) => b.type === 'server_tool_use').length;
    if (sources) collectSources(response.content, sources);

    if (response.stop_reason !== 'pause_turn') break;
    if (turn === MAX_PAUSE_CONTINUES) {
      throw new Error(`[${agentName}] still pause_turn after ${MAX_PAUSE_CONTINUES} continuations`);
    }
    log?.(`  ⏸️  [${agentName}] pause_turn — continuing (${turn + 1}/${MAX_PAUSE_CONTINUES})`);
    messages.push({ role: 'assistant', content: response.content });
  }

  // stop_reason 검증
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`[${agentName}] response truncated (stop_reason=max_tokens). Increase maxTokens.`);
  }
  if (response.stop_reason !== 'tool_use' && response.stop_reason !== 'end_turn') {
    throw new Error(`[${agentName}] unexpected stop_reason=${response.stop_reason}`);
  }

  // web_search가 켜졌을 경우 server_tool_use(검색 쿼리), web_search_tool_result(검색 결과) 블록도 섞여 옴.
  // 우리가 원하는 건 custom tool인 toolName의 호출.
  const toolUseBlock = response.content.find(
    (b) => b.type === 'tool_use' && b.name === toolName
  );
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    // 검색 횟수 로깅 (디버깅용)
    if (searchCount > 0) log?.(`  ℹ️  [${agentName}] performed ${searchCount} web searches`);

    const textBlocks = response.content.filter((b) => b.type === 'text');
    const textPreview = textBlocks.length > 0 && textBlocks[0].type === 'text'
      ? textBlocks[0].text.slice(0, 300)
      : '(no text)';
    throw new Error(`[${agentName}] no '${toolName}' tool_use block in response (stop_reason=${response.stop_reason}). Text: ${textPreview}`);
  }

  // 디버깅: 웹 검색 사용 횟수 로깅
  if (searchCount > 0) log?.(`  🌐 [${agentName}] used ${searchCount} web search(es)`);

  return toolUseBlock.input as T;
}

// =================== Schemas (plain JSON Schema) ===================

// 블로그 네 기둥. marketing.md / refresh-trending-topics.ts / video-analyze와 함께 관리할 것.
export const PILLARS = ['과학', 'AI·테크', '경제·금융', '교육'] as const;
export const OFF_PILLAR = '해당없음';
export type Pillar = (typeof PILLARS)[number] | typeof OFF_PILLAR;

export const MARKETING_SCHEMA = {
  type: 'object',
  required: ['selected_keyword', 'pillar', 'search_intent', 'target_audience', 'angle', 'key_points', 'cover_image_query', 'reasoning'],
  properties: {
    selected_keyword: { type: 'string' },
    pillar: { type: 'string', enum: [...PILLARS, OFF_PILLAR] },
    search_intent: { type: 'string' },
    target_audience: { type: 'string' },
    angle: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    long_tail_variations: { type: 'array', items: { type: 'string' } },
    cover_image_query: { type: 'string' },
    reasoning: { type: 'string' },
  },
};

export const OPERATIONS_SCHEMA = {
  type: 'object',
  required: ['title', 'summary', 'tags', 'content_markdown'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    content_markdown: { type: 'string' },
  },
};

export const QA_SCHEMA = {
  type: 'object',
  required: ['approved', 'severity', 'issues', 'overall_comment'],
  properties: {
    approved: { type: 'boolean' },
    severity: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          level: { type: 'string', enum: ['minor', 'major'] },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
    overall_comment: { type: 'string' },
  },
};

// =================== Output Types ===================

export interface MarketingOutput {
  selected_keyword: string;
  pillar: Pillar;
  search_intent: string;
  target_audience: string;
  angle: string;
  key_points: string[];
  long_tail_variations?: string[];
  cover_image_query: string;
  reasoning: string;
}

export interface OperationsOutput {
  title: string;
  summary: string;
  tags: string[];
  content_markdown: string;
}

export interface QaIssue {
  category: string;
  level: 'minor' | 'major' | string;
  description: string;
  suggestion?: string;
}

export interface QaOutput {
  approved: boolean;
  severity: 'ok' | 'minor' | 'major' | string;
  issues: QaIssue[];
  overall_comment: string;
}

// =================== Safety Net ===================

/**
 * QA 출력이 모호하면 통과시키는 안전장치.
 * 시스템 오류로 인한 false rejection 방지.
 */
export function shouldApproveDespiteAmbiguity(qa: QaOutput): boolean {
  // major가 있으면 approved=true여도 거절 — 체험 날조·사실 오류가 승인 플래그로 새지 않게.
  if (qa.issues?.some((i) => i.level === 'major')) return false;
  return true;
}
