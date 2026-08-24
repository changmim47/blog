import type { Metadata } from 'next';
import type { PostType } from '../types';
import { getPublishedPostsPaginated } from '../services/postsServer';
import SectionPage from './SectionPage';

export const SECTION_PAGE_SIZE = 20;

export const sectionMetadata: Record<PostType, Metadata> = {
  gallery: {
    title: 'Gallery',
    description: 'Daily Memorylog의 사진과 순간 기록입니다.',
    alternates: { canonical: '/gallery' },
  },
  playlist: {
    title: 'Playlist',
    description: 'Daily Memorylog의 음악과 플레이리스트 기록입니다.',
    alternates: { canonical: '/playlist' },
  },
  blog: {
    title: 'Blog',
    description: 'AI 도구, 자동화, 개발 및 생산성 도구의 실사용 기록입니다.',
    alternates: { canonical: '/blog' },
  },
};

const copy: Record<PostType, { title: string; subtitle: string }> = {
  gallery: { title: 'Gallery', subtitle: 'Moments frozen in time.' },
  playlist: { title: 'Playlist', subtitle: 'Curated sounds & vibes.' },
  blog: { title: 'Journal', subtitle: 'AI tools, automation, and practical notes.' },
};

export default async function SectionRoute({ type }: { type: PostType }) {
  const { posts, hasMore } = await getPublishedPostsPaginated(type, SECTION_PAGE_SIZE, 0);
  return (
    <SectionPage
      type={type}
      title={copy[type].title}
      subtitle={copy[type].subtitle}
      initialPosts={posts}
      initialHasMore={hasMore}
    />
  );
}
