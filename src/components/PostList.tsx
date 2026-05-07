
import React from 'react';
import { Link } from 'react-router-dom';
import { BlogPost, PostType } from '../types';
import { MusicIcon, HeartIcon } from './Icons';
import AdUnit from './AdUnit';

interface PostListProps {
  posts: BlogPost[];
  section: PostType;
  onDeletePost: (e: React.MouseEvent, id: string) => void;
  isAdmin: boolean;
}

const PostList: React.FC<PostListProps> = ({ posts, section, onDeletePost, isAdmin }) => {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center opacity-60">
        <div className="bg-white p-6 rounded-full mb-6 shadow-sm">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
        </div>
        <p className="text-slate-400 font-serif italic text-lg">
          {isAdmin ? 'Start your collection.' : 'Nothing here yet.'}
        </p>
      </div>
    );
  }

  // --- Gallery Layout (Grid) ---
  if (section === 'gallery') {
    return (
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4 pb-12 px-2">
            {posts.map((post) => (
                <div 
                    key={post.id}
                    className="break-inside-avoid group relative rounded-xl overflow-hidden cursor-pointer bg-slate-200"
                >
                    <Link to={`/p/${post.id}`} className="block">
                        <img 
                            src={post.coverImage} 
                            alt={post.title} 
                            loading="lazy"
                            className="w-full h-auto object-cover transition-opacity duration-300 group-hover:opacity-90"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                            <p className="text-white font-medium text-sm line-clamp-1">{post.title}</p>
                            <div className="flex justify-between items-center mt-1">
                                <span className="text-white/70 text-[10px] uppercase tracking-wider">{new Date(post.createdAt).toLocaleDateString()}</span>
                                {(post.likes || 0) > 0 && (
                                    <div className="flex items-center text-white/90 text-xs">
                                        <HeartIcon className="w-3 h-3 mr-1 fill-current" solid />
                                        {post.likes}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Link>
                    {isAdmin && (
                         <button
                            onClick={(e) => onDeletePost(e, post.id)}
                            className="absolute top-2 right-2 bg-white/20 hover:bg-red-500/80 backdrop-blur-md text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                        >
                             <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
  }

  // --- Blog Layout (List) ---
  if (section === 'blog') {
    return (
        <div className="flex flex-col gap-12 max-w-3xl mx-auto pb-20">
            {posts.map((post, index) => (
                <React.Fragment key={post.id}>
                    {/* Insert In-feed Ad */}
                    {index > 0 && index % 3 === 0 && (
                        <AdUnit type="in-feed" className="my-8" />
                    )}
                    
                    <article className="group cursor-pointer">
                        <Link to={`/p/${post.id}`} className="block">
                             <div className="flex items-baseline justify-between mb-3 border-b border-slate-100 pb-2">
                                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    {new Date(post.createdAt).toLocaleDateString()}
                                </span>
                                 <div className="flex gap-2">
                                    {post.tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[10px] text-slate-400 uppercase border border-slate-200 rounded-full px-2 py-0.5">#{tag}</span>
                                    ))}
                                </div>
                             </div>

                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="flex-1">
                                    <h2 className="text-3xl font-serif font-medium text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors leading-tight">
                                        {post.title}
                                    </h2>
                                    <p className="text-slate-500 text-base leading-relaxed line-clamp-3 font-light mb-4">
                                        {post.summary}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                                        <span className="flex items-center group-hover:text-indigo-600 transition-colors">Read More &rarr;</span>
                                        <div className="flex items-center gap-1">
                                            <HeartIcon className={`w-3.5 h-3.5 ${post.likes ? 'text-rose-400 fill-rose-400' : ''}`} solid={!!post.likes} />
                                            <span>{post.likes || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                {post.coverImage && (
                                    <div className="w-full md:w-56 aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 shrink-0 shadow-sm group-hover:shadow-md transition-all">
                                        <img 
                                            src={post.coverImage} 
                                            alt={post.title} 
                                            loading="lazy"
                                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" 
                                        />
                                    </div>
                                )}
                            </div>
                        </Link>
                         {isAdmin && (
                            <button
                            onClick={(e) => onDeletePost(e, post.id)}
                            className="text-slate-300 hover:text-red-500 text-xs mt-4 underline decoration-slate-200"
                            >
                                Delete Entry
                            </button>
                        )}
                    </article>
                </React.Fragment>
            ))}
        </div>
    );
  }

  // --- Playlist Layout (Cards) - Default ---
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 pb-20">
      {posts.map((post) => (
        <article key={post.id} className="group cursor-pointer flex flex-col h-full">
          <Link to={`/p/${post.id}`} className="flex flex-col h-full">
              <div className="relative aspect-square overflow-hidden rounded-2xl shadow-lg shadow-slate-200 mb-6 group-hover:shadow-xl group-hover:shadow-indigo-100 transition-all duration-500">
                <img 
                    src={post.coverImage} 
                    alt={post.title} 
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                {post.audioUrl && (
                    <div className="absolute bottom-4 right-4 bg-white/20 backdrop-blur-md p-3 rounded-full text-white border border-white/30 animate-pulse">
                        <MusicIcon className="w-5 h-5" />
                    </div>
                )}
              </div>
              
              <div className="flex flex-col flex-grow text-center px-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {post.tags[0] || 'Music'}
                </div>
                
                <h2 className="text-2xl font-serif text-slate-900 mb-3 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-tight">
                  {post.title}
                </h2>
                
                <p className="text-slate-500 text-sm leading-relaxed mb-4 line-clamp-2 font-light">
                  {post.summary}
                </p>
                
                <div className="mt-auto pt-4 border-t border-slate-100 flex justify-center items-center gap-4 text-xs text-slate-400">
                   <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                   <div className="flex items-center gap-1">
                      <HeartIcon className={`w-3.5 h-3.5 ${post.likes ? 'text-rose-400 fill-rose-400' : ''}`} solid={!!post.likes} />
                      <span>{post.likes || 0}</span>
                   </div>
                </div>
              </div>
          </Link>
          {isAdmin && (
              <button onClick={(e) => onDeletePost(e, post.id)} className="text-xs text-slate-300 hover:text-red-500 mt-2">Delete</button>
           )}
        </article>
      ))}
    </div>
  );
};

export default PostList;
