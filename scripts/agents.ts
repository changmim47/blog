import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '..', 'agents');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const MAX_ATTEMPTS = 4;

let _aiClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY missing');
    _aiClient = new GoogleGenAI({ apiKey });
  }
  return _aiClient;
}

const promptCache = new Map<string, string>();
async function loadAgentPrompt(name: 'marketing' | 'operations' | 'qa'): Promise<string> {
  if (promptCache.has(name)) return promptCache.get(name)!;
  const filepath = path.join(AGENTS_DIR, `${name}.md`);
  const content = await readFile(filepath, 'utf-8');
  promptCache.set(name, content);
  return content;
}

interface CallAgentOptions {
  agentName: 'marketing' | 'operations' | 'qa';
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  log?: (msg: string) => void;
}

// 에이전트별 기본 토큰 한도
// - marketing/qa: 짧은 JSON이라 32k면 충분
// - operations: 한국어 본문 + 메타 필드 합치면 thinking 포함 시 32k 넘는 경우 발생 → 모델 최대치
const DEFAULT_MAX_TOKENS: Record<string, number> = {
  marketing: 32768,
  operations: 65536,
  qa: 32768,
};

export async function callAgent<T = unknown>(opts: CallAgentOptions): Promise<T> {
  const { agentName, userPrompt, responseSchema, log } = opts;
  const maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_TOKENS[agentName] ?? 32768;
  const systemInstruction = await loadAgentPrompt(agentName);
  const ai = getClient();

  const requestConfig = {
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema,
    },
  };

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
      log?.(`  ⚠️  [${agentName}] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${errStr.slice(0, 100)}`);
      log?.(`     retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!response) throw lastError ?? new Error(`[${agentName}] call failed`);

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`[${agentName}] response truncated (finishReason=${finishReason}). Increase maxOutputTokens.`);
  }

  const text = response.text;
  if (!text) throw new Error(`[${agentName}] returned empty response`);

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`[${agentName}] failed to parse JSON: ${(e as Error).message}\nRaw: ${text.slice(0, 500)}`);
  }
}

// =================== Schemas ===================

export const MARKETING_SCHEMA = {
  type: Type.OBJECT,
  required: ['selected_keyword', 'search_intent', 'target_audience', 'angle', 'key_points', 'reasoning'],
  properties: {
    selected_keyword: { type: Type.STRING },
    search_intent: { type: Type.STRING },
    target_audience: { type: Type.STRING },
    angle: { type: Type.STRING },
    key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    long_tail_variations: { type: Type.ARRAY, items: { type: Type.STRING } },
    reasoning: { type: Type.STRING },
  },
};

export const OPERATIONS_SCHEMA = {
  type: Type.OBJECT,
  required: ['title', 'summary', 'tags', 'content_markdown'],
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    content_markdown: { type: Type.STRING },
    image_alt_suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          position: { type: Type.STRING },
          alt_text: { type: Type.STRING },
        },
      },
    },
    technical_notes: { type: Type.STRING },
  },
};

export const QA_SCHEMA = {
  type: Type.OBJECT,
  required: ['approved', 'severity', 'issues', 'overall_comment'],
  properties: {
    approved: { type: Type.BOOLEAN },
    severity: { type: Type.STRING },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          level: { type: Type.STRING },
          description: { type: Type.STRING },
          suggestion: { type: Type.STRING },
        },
      },
    },
    overall_comment: { type: Type.STRING },
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
  // approved=false 인데 issues가 비어 있거나 major가 하나도 없으면 통과로 처리
  if (!qa.issues || qa.issues.length === 0) return true;
  const hasMajor = qa.issues.some((i) => i.level === 'major');
  if (!hasMajor) return true;
  return false;
}
