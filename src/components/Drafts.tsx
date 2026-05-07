import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BlogPost } from '../types';
import { getDraftPosts } from '../services/storage';

interface DraftsProps {
  refreshKey: number;
}

const Drafts: React.FC<DraftsProps> = ({ refreshKey }) => {
  const [drafts, setDrafts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getDraftPosts().then((d) => {
      if (cancelled) return;
      setDrafts(d);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto">
      <header className="mb-12 mt-8 text-center">
        <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">Drafts</h2>
        <div className="w-16 h-1 bg-amber-500 mx-auto mb-6"></div>
        <p className="text-slate-500 text-lg font-light italic font-serif">
          Unpublished posts. Only visible to you.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-serif italic">
          No drafts yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-12">
          {drafts.map((post) => (
            <Link
              key={post.id}
              to={`/p/${post.id}`}
              className="block bg-white rounded-xl p-6 border border-slate-200 hover:border-amber-400 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Draft
                    </span>
                    <span className="text-xs text-slate-400 uppercase tracking-wider">{post.type}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-xl font-serif font-medium text-slate-900 mb-1 line-clamp-1">
                    {post.title || '(제목 없음)'}
                  </h3>
                  <p className="text-sm text-slate-500 line-clamp-2 font-light">
                    {post.summary || '(요약 없음)'}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Drafts;
