import type { Metadata } from 'next';
import EditorPageClient from '../../src/components/EditorPageClient';

export const metadata: Metadata = {
  title: '새 글 작성',
  robots: { index: false, follow: false },
};

export default function WritePage() {
  return <EditorPageClient />;
}
