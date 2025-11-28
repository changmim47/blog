
import React from 'react';
import { Link } from 'react-router-dom';
import { BlogPost } from '../types';
import { ArrowRightIcon } from './Icons';
import AdUnit from './AdUnit';

interface DashboardProps {
  posts: BlogPost[];
}

const Dashboard: React.FC<DashboardProps> = ({ posts }) => {
  const galleryPosts = posts.filter(p => p.type === 'gallery').slice(0, 4);
  const playlistPosts = posts.filter(p => p.type === 'playlist' || (!p.type)).slice(0, 3);
  const blogPosts = posts.filter(p => p.type === 'blog').slice(0, 3);

  return (
    <div className="flex flex-col gap-20 animate-fade-in-up pb-12">
      {/* Hero / Intro */}
      <section className="text-center py-20 md:py-28 relative">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-indigo-100/30 to-rose-100/30 rounded-full blur-3xl -z-10"></div>
        <h2 className="text-5xl md:text-8xl font-serif font-bold text-slate-900 mb-6 tracking-tight leading-tight">
          Memory
        </h2>
        <p className="text-lg md:text-2xl text-slate-500 max-w-2xl mx-auto leading-relaxed font-light font-serif italic">
          for cherished photos, songs, and the stories in between.
        </p>
      </section>

      {/* Gallery Section */}
      <section>
        <div className="flex items-end justify-between mb-8 border-b border-slate-200 pb-4">
            <div>
                <span className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1 block">Gallery </span>
                <h3 className="text-3xl font-serif font-medium text-slate-900">📷 Recent Photo</h3>
            </div>
            <Link 
                to="/gallery"
                className="text-sm font-medium text-slate-500 hover:text-black transition-colors flex items-center group"
            >
                View All
                <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
        </div>
        
        {galleryPosts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {galleryPosts.map((post, idx) => (
                    <Link 
                        key={post.id}
                        to={`/p/${post.id}`}
                        className={`relative aspect-[3/4] overflow-hidden cursor-pointer group ${idx % 2 === 0 ? 'rounded-tl-3xl rounded-br-3xl' : 'rounded-tr-3xl rounded-bl-3xl'}`}
                    >
                        <img 
                            src={post.coverImage} 
                            alt={post.title} 
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-500" />
                        <div className="absolute bottom-0 left-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/60 to-transparent">
                            <p className="text-white text-sm font-medium truncate">{post.title}</p>
                        </div>
                    </Link>
                ))}
            </div>
        ) : (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400 text-sm font-light">
                No photos yet.
            </div>
        )}
      </section>

      {/* Playlist Section */}
      <section>
        <div className="flex items-end justify-between mb-8 border-b border-slate-200 pb-4">
             <div>
                <span className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1 block">Playlist</span>
                <h3 className="text-3xl font-serif font-medium text-slate-900">🎵 Song</h3>
            </div>
            <Link 
                to="/playlist"
                className="text-sm font-medium text-slate-500 hover:text-black transition-colors flex items-center group"
            >
                View All
                <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
        </div>

        {playlistPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {playlistPosts.map(post => (
                    <Link 
                        key={post.id}
                        to={`/p/${post.id}`}
                        className="group cursor-pointer"
                    >
                        <div className="aspect-square overflow-hidden rounded-2xl shadow-sm mb-4 relative">
                             <img 
                                src={post.coverImage} 
                                alt={post.title} 
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            {/* Vinyl Effect */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none opacity-50"></div>
                        </div>
                        <div>
                            <h4 className="font-serif text-xl text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{post.title}</h4>
                            <p className="text-xs text-slate-400 uppercase tracking-wider line-clamp-1">{post.tags.join(' • ')}</p>
                        </div>
                    </Link>
                ))}
            </div>
        ) : (
             <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400 text-sm font-light">
                No music added.
            </div>
        )}
      </section>

      {/* AdSense: Middle Banner */}
      <AdUnit type="banner" />

      {/* Blog Section */}
      <section>
        <div className="flex items-end justify-between mb-8 border-b border-slate-200 pb-4">
             <div>
                <span className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1 block">Blog</span>
                <h3 className="text-3xl font-serif font-medium text-slate-900">🧾 My Note</h3>
            </div>
            <Link 
                to="/blog"
                className="text-sm font-medium text-slate-500 hover:text-black transition-colors flex items-center group"
            >
                View All
                <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
        </div>

        {blogPosts.length > 0 ? (
            <div className="flex flex-col gap-8">
                {blogPosts.map(post => (
                    <Link 
                        key={post.id}
                        to={`/p/${post.id}`}
                        className="group flex flex-col md:flex-row gap-6 cursor-pointer items-start"
                    >
                         <div className="w-full md:w-64 aspect-[3/2] rounded-lg overflow-hidden bg-slate-100 shrink-0">
                            {post.coverImage && (
                                <img 
                                    src={post.coverImage} 
                                    alt={post.title} 
                                    loading="lazy"
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0" 
                                />
                            )}
                         </div>
                         <div className="flex-1 min-w-0 py-2">
                             <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                {new Date(post.createdAt).toLocaleDateString()}
                             </div>
                             <h4 className="text-2xl font-serif text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">{post.title}</h4>
                             <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 font-light">{post.summary}</p>
                             <div className="mt-4 text-xs font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                                Read Story <ArrowRightIcon className="w-3 h-3 ml-1" />
                             </div>
                         </div>
                    </Link>
                ))}
            </div>
        ) : (
             <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-400 text-sm font-light">
                No entries yet.
            </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
