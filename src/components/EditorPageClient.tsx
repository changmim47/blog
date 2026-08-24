'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import type { BlogPost, PostType } from '../types';
import { savePost } from '../services/storage';
import AdminGate from './AdminGate';
import Editor from './Editor';

export default function EditorPageClient({ isEdit = false }: { isEdit?: boolean }) {
  const router = useRouter();

  const handleSave = async (post: BlogPost) => {
    try {
      await savePost(post);
      const destination: Record<PostType, string> = {
        gallery: '/gallery',
        playlist: '/playlist',
        blog: '/blog',
      };
      router.push(destination[post.type]);
      router.refresh();
    } catch (error) {
      console.error('Save error:', error);
      window.alert('저장에 실패했습니다.');
    }
  };

  return (
    <AdminGate>
      {/* Editor가 useSearchParams를 쓰므로 정적 프리렌더에는 Suspense 경계가 필요하다. */}
      <Suspense
        fallback={
          <div className="min-h-[50vh] flex items-center justify-center text-slate-400">
            Loading editor...
          </div>
        }
      >
        <Editor
          defaultType="gallery"
          onSave={handleSave}
          onCancel={() => router.back()}
          isEdit={isEdit}
        />
      </Suspense>
    </AdminGate>
  );
}
