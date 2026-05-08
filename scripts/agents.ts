import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '..', 'agents');

// 환경변수로 모델 변경 가능 (예: claude-haiku-4-5, claude-opus-4-7)
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const MAX_ATTEMPTS = 4;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
    _client = new Anthropic({ apiKey });
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
  log?: (msg: string) => void;
}

export async function callAgent<T = unknown>(opts: CallAgentOptions): Promise<T> {
  const { agentName, userPrompt, toolName, toolDescription, inputSchema, log } = opts;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS[agentName] ?? 4096;
  const systemInstruction = await loadAgentPrompt(agentName);
  const client = getClient();

  const requestParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system: systemInstruction,
    tools: [
      {
        name: toolName,
        description: toolDescription,
        input_schema: inputSchema as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: userPrompt }],
  };

  let response: Anthropic.Messages.Message | undefined;
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
        errStr.includes('504');

      if (!isRetryable || attempt === MAX_ATTEMPTS) throw e;

      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 30_000;
      log?.(`  ⚠️  [${agentName}] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${errStr.slice(0, 120)}`);
      log?.(`     retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!response) throw lastError ?? new Error(`[${agentName}] call failed`);

  // stop_reason 검증
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`[${agentName}] response truncated (stop_reason=max_tokens). Increase maxTokens.`);
  }
  if (response.stop_reason !== 'tool_use' && response.stop_reason !== 'end_turn') {
    throw new Error(`[${agentName}] unexpected stop_reason=${response.stop_reason}`);
  }

  // tool_use block에서 input 추출
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const textPreview = textBlocks.length > 0 && textBlocks[0].type === 'text'
      ? textBlocks[0].text.slice(0, 300)
      : '(no text)';
    throw new Error(`[${agentName}] no tool_use block in response. Text: ${textPreview}`);
  }

  return toolUseBlock.input as T;
}

// =================== Schemas (plain JSON Schema) ===================

export const MARKETING_SCHEMA = {
  type: 'object',
  required: ['selected_keyword', 'search_intent', 'target_audience', 'angle', 'key_points', 'reasoning'],
  properties: {
    selected_keyword: { type: 'string' },
    search_intent: { type: 'string' },
    target_audience: { type: 'string' },
    angle: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    long_tail_variations: { type: 'array', items: { type: 'string' } },
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
    image_alt_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: { type: 'string' },
          alt_text: { type: 'string' },
        },
      },
    },
    technical_notes: { type: 'string' },
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
          level: { type: 'string' },
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
  search_intent: string;
  target_audience: string;
  angle: string;
  key_points: string[];
  long_tail_variations?: string[];
  reasoning: string;
}

export interface OperationsOutput {
  title: string;
  summary: string;
  tags: string[];
  content_markdown: string;
  image_alt_suggestions?: { position: string; alt_text: string }[];
  technical_notes?: string;
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
  if (qa.approved === true) return true;
  if (!qa.issues || qa.issues.length === 0) return true;
  const hasMajor = qa.issues.some((i) => i.level === 'major');
  if (!hasMajor) return true;
  return false;
}
