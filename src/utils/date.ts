/**
 * 날짜 포맷 유틸.
 *
 * 정적 익스포트 빌드는 UTC 서버에서 돌고 브라우저는 KST라서,
 * timeZone을 고정하지 않으면 같은 글이 서버에서는 "8월 20일",
 * 브라우저에서는 "8월 21일"로 렌더링된다. 그 결과:
 *   - React hydration mismatch (error #418)
 *   - 크롤러에게 하루 밀린 날짜가 노출
 * 블로그 기준 시간대를 고정해서 양쪽을 일치시킨다.
 */
const TIME_ZONE = 'Asia/Seoul';

export function formatDate(value: number | string | Date): string {
  return new Date(value).toLocaleDateString('ko-KR', { timeZone: TIME_ZONE });
}

export function formatDateLong(value: number | string | Date): string {
  return new Date(value).toLocaleDateString('ko-KR', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 오늘 날짜를 KST 기준 'YYYY-MM-DD'로 반환한다.
 * visitor_stats.date와 비교할 때 사용 — DB의 increment_visit도 KST 날짜로 기록하므로
 * toISOString()(UTC)을 쓰면 KST 자정~오전 9시 사이에 어제 날짜를 조회하게 된다.
 * (en-CA 로케일은 YYYY-MM-DD 형식을 낸다.)
 */
export function todaySeoul(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}
