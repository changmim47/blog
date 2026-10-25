import type { PILLARS } from './agents';

// 블로그 시드 키워드 풀 — 네 기둥: 과학 / AI·테크 / 경제 / 교육.
// (2026-08-31 재편: 인기 위주 잡식에서 주제 집중으로 전환. topical authority 확보 목적)
// 자유롭게 추가/제거하세요. 너무 많으면 autocomplete 호출이 느려집니다 (하루에 오늘 기둥의 시드만 호출, 기둥당 ~10개).

// 기둥별로 묶어 둔다 — generate-post가 KST 날짜로 오늘의 기둥을 정하고 그 기둥 시드만 쓴다.
// 키 순서가 순환 순서다(바꾸면 그날부터 기둥 배정이 밀린다). 키는 agents.ts의 PILLARS와 같아야 해서 타입으로 묶었다.
export const SEED_PILLARS: Record<(typeof PILLARS)[number], string[]> = {
  'AI·테크': [
    'ChatGPT',
    'Claude',
    'Gemini',
    '생성형 AI',
    'AI 도구',
    'AI 에이전트',
    'AI 자동화',
    '프롬프트 엔지니어링',
    'AI 활용법',
    'AI 트렌드',
    'LLM',
    '퍼플렉시티',
  ],
  과학: [
    '우주 탐사',
    '제임스웹 망원경',
    '양자컴퓨터',
    '뇌과학',
    '유전자 치료',
    '기후변화 대응',
    '반도체 원리',
    '노벨상',
    '과학 상식',
    '신약 개발',
  ],
  '경제·금융': [
    '기준금리',
    '환율 전망',
    'ETF 투자',
    'ISA 계좌',
    '연금저축',
    '연말정산',
    '인플레이션',
    '경제 공부',
    '부동산 전망',
    '미국 주식',
  ],
  교육: [
    '수능 준비',
    '대입 전형',
    '코딩 교육',
    '영어 공부법',
    '자격증 추천',
    '온라인 강의',
    'AI 교육',
    '평생 학습',
  ],
};

// 오늘 쓸 기둥부터 시작하는 SEED_PILLARS 순서. [0]이 오늘의 기둥, 나머지는 후보가 없을 때 넘어갈 순서.
// KST 날짜의 epoch 일수 % 4 — 요일 매핑(7일)이 아니라 일수 순환이라 장기적으로 기둥마다 정확히 1/4.
// 날짜는 generate-post의 buildCurrentContext와 같은 방식으로 KST 기준(cron UTC 23:00 = KST 다음날 08:00).
// generate-post와 refresh-trending이 같이 쓴다 — 같은 날이면 트렌딩 적재 기둥과 claim 기둥이 일치해야 한다.
export function pillarOrderForToday() {
  const isoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const dayIndex = Date.parse(isoDate) / 86_400_000; // 'YYYY-MM-DD'는 UTC 자정으로 파싱되어 정수
  const pillars = Object.keys(SEED_PILLARS) as (keyof typeof SEED_PILLARS)[];
  const start = dayIndex % pillars.length;
  return [...pillars.slice(start), ...pillars.slice(0, start)];
}
