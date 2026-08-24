import type { Metadata } from 'next';
import EditorPageClient from '../../src/components/EditorPageClient';

export const metadata: Metadata = {
  title: '글 수정',
  robots: { index: false, follow: false },
};

// 정적 익스포트에는 동적 세그먼트를 미리 알 수 없는 관리자 라우트를 둘 수 없어서
// /edit/[id] 대신 /edit?id=... 쿼리 파라미터를 사용한다.
export default function EditPage() {
  return <EditorPageClient isEdit />;
}
