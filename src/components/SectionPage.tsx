'use client';

import React, { useState } from 'react';
import { BlogPost, PostType } from '../types';
import { getPostsPaginated } from '../services/storage';
import PostList from './PostList';
import { useIsAdmin } from './AdminContext';

const PAGE_SIZE = 20;

interface SectionPageProps {
  type: PostType;
  title: string;
  subtitle: string;
  initialPosts: BlogPost[];
  initialHasMore: boolean;
}

const SectionPage: React.FC<SectionPageProps> = ({
  type,
  title,
  subtitle,
  initialPosts,
  initialHasMore,
}) => {
  const isAdmin = useIsAdmin();
  const [posts, setPosts] = useState<BlogPost[]>(initialPosts);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);

  const onDeletePost = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm('정말 이 글을 삭제하시겠습니까?')) return;
    const { deletePost } = await import('../services/storage');
    await deletePost(id);
    setPosts((current) => current.filter((post) => post.id !== id));
  };

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const { posts: more, hasMore: stillMore } = await getPostsPaginated(type, PAGE_SIZE, posts.length);
    setPosts((prev) => [...prev, ...more]);
    setHasMore(stillMore);
    setIsLoadingMore(false);
  };

  return (
    <div className="animate-fade-in-up">
      <header className="mb-16 mt-8 text-center relative">
        <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">
          {title}
        </h2>
        <div className="w-16 h-1 bg-black mx-auto mb-6"></div>
        <p className="text-slate-500 text-lg font-light italic font-serif">{subtitle}</p>
      </header>

      <>
          <PostList posts={posts} section={type} onDeletePost={onDeletePost} isAdmin={isAdmin} />

          {hasMore && (
            <div className="flex justify-center mt-12 mb-8">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 px-8 py-3 border border-slate-300 rounded-full text-sm font-medium text-slate-600 hover:border-black hover:text-black transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoadingMore ? (
                  <>
                    <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <span className="tracking-wider uppercase text-xs font-bold">Load More</span>
                )}
              </button>
            </div>
          )}
      </>
    </div>
  );
};

export default SectionPage;
