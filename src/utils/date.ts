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
