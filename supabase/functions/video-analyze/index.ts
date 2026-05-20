// YouTube 영상 단건 심층 분석 (Gemini Native Video Understanding)
//
// 입력: { videoId: string }
// 출력: { videoId, youtubeUrl, summary, keyTopics[], blogSuggestions[] }
//
// Gemini가 YouTube URL을 직접 받아 영상(시각+음성+자막)을 모두 이해.
// 자막 스크래핑 불필요. 자막 없는 영상도 분석 가능.
//
// 시크릿: GEMINI_API_KEY
// 인증: 로그인된 admin만

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['summary', 'key_topics', 'blog_suggestions'],
  properties: {
    summary: { type: 'string' },
    key_topics: { type: 'array', items: { type: 'string' } },
    blog_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'angle'],
        properties: {
          title: { type: 'string' },
          angle: { type: 'string' },
        },
      },
    },
  },
};

const PROMPT = `이 YouTube 영상을 보고 분석해 주세요.

[블로그 컨셉]
- AI 비전공자가 AI 도구와 생태계를 직접 써보고 학습 과정을 정리하는 블로그
- 한국어 콘텐츠, 친근하고 솔직한 톤
- 독자: AI에 관심 있지만 깊은 기술 지식은 없는 한국 사용자

[다음 세 가지를 모두 한국어로 분석해 주세요]

1. summary: 영상의 핵심 요약 3~5문장. 무엇을 다루고, 어떤 결론/주장인지.

2. key_topics: 영상에서 언급된 주요 키워드/토픽 5~10개.
   - 짧은 단어 또는 구 (각 2~10자)
   - 한국어 우선, 브랜드명·고유명사는 원문 표기

3. blog_suggestions: 이 영상 내용을 바탕으로 블로그 글로 다룰 만한 주제 5개.
   각 항목:
   - title: 자연스러운 한국어 블로그 제목 (30~50자)
   - angle: 이 글의 차별화 각도 (1~2문장). 단순 영상 요약이 아니라 독자에게 가치 있는 시각

   주제 선정 기준:
   - 블로그 컨셉(AI 비전공자 학습)에 자연스럽게 어울림
   - 검색 의도가 명확함 (사용법, 비교, 후기, 추천 등)
   - 영상 내용을 그대로 베끼는 게 아니라, 영상에서 영감을 받아 독자에게 도움되는 관점

영어 단어는 항상 첫 글자 대문자로 (ChatGPT, Claude, Gemini, OpenAI 등).`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured in Edge Function secrets' }, 500);
    }

    // 인증
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Authentication required' }, 401);
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: 'Invalid or expired session' }, 401);

    const body = await req.json().catch(() => ({}));
    const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
    if (!videoId) return json({ error: 'videoId required' }, 400);

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Gemini REST API 직접 호출 (SDK 우회로 Deno 호환성 ↑)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: youtubeUrl, mimeType: 'video/*' } },
          { text: PROMPT },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error?.message ?? res.statusText;
      // Gemini가 영상을 가져올 수 없는 경우 (비공개, 지역 제한 등) 안내
      if (typeof msg === 'string' && (msg.includes('inaccessible') || msg.includes('FAILED_PRECONDITION'))) {
        return json({ error: '영상을 불러올 수 없습니다 (비공개/지역제한/삭제됨)' }, 422);
      }
      return json({ error: `Gemini analysis failed: ${msg}` }, 502);
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      return json({ error: `Response truncated (finishReason=${finishReason})` }, 502);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: 'Gemini returned empty response' }, 502);

    let parsed: { summary: string; key_topics: string[]; blog_suggestions: Array<{ title: string; angle: string }> };
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return json({ error: `Failed to parse JSON: ${(e as Error).message}` }, 502);
    }

    return json({
      videoId,
      youtubeUrl,
      model: GEMINI_MODEL,
      summary: parsed.summary,
      keyTopics: parsed.key_topics ?? [],
      blogSuggestions: parsed.blog_suggestions ?? [],
    });
  } catch (e) {
    console.error('video-analyze error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
