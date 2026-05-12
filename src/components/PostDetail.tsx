
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { BlogPost } from '../types';
import { ChevronLeftIcon, MusicIcon, XMarkIcon, ArrowsPointingOutIcon, HeartIcon, ListBulletIcon, ShareIcon, TrashIcon } from './Icons';
import AdUnit from './AdUnit';
import { updatePostLikes, getPostById, togglePublished, getRelatedPosts, recordPostView } from '../services/storage';

const markdownComponents: Components = {
  h1: ({ children }) => <h2 className="text-3xl font-bold text-slate-800 mt-8 mb-4">{children}</h2>,
  h2: ({ children }) => <h3 className="text-2xl font-bold text-slate-800 mt-6 mb-3">{children}</h3>,
  h3: ({ children }) => <h4 className="text-xl font-bold text-slate-800 mt-5 mb-2">{children}</h4>,
  p: ({ children }) => <p className="mb-4 leading-loose">{children}</p>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-indigo-300 pl-4 italic text-slate-600 my-4 bg-slate-50 py-2 pr-2">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-800">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ children }) => (
    <code className="bg-slate-100 text-rose-600 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto text-sm my-4">{children}</pre>
  ),
  hr: () => <hr className="border-slate-200 my-8" />,
};

interface PostDetailProps {
  isAdmin: boolean;
  onDelete?: (id: string) => void;
  onOpenLogin?: () => void;
}

const PostDetail: React.FC<PostDetailProps> = ({ isAdmin, onDelete, onOpenLogin }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [post, setPost] = useState<BlogPost | undefined>(undefined);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [likes, setLikes] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLikeAnimating, setIsLikeAnimating] = useState(false);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  
  // Share Feedback State
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);

  // Related Posts
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);

  // Loading & Error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
      if (!id) {
          setIsLoading(false);
          setError("Invalid Post ID");
          return;
      }

      const initPost = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedPost = await getPostById(id);
            if (fetchedPost) {
                setPost(fetchedPost);
            } else {
                setError("Post not found");
            }
        } catch (e) {
            setError("Failed to load post");
        } finally {
            setIsLoading(false);
        }
      };

      initPost();
  }, [id]);

  // Update SEO + structured data + like state when 'post' is set
  useEffect(() => {
      if (!post) return;

      const cleanups: Array<() => void> = [];

      // === Title ===
      const prevTitle = document.title;
      document.title = `${post.title} | My Space`;
      cleanups.push(() => { document.title = prevTitle; });

      // === Existing meta description: 값만 바꾸고 cleanup에서 복구 ===
      const metaDesc = document.querySelector('meta[name="description"]');
      const prevDesc = metaDesc?.getAttribute('content') ?? '';
      metaDesc?.setAttribute('content', post.summary || 'A post on My Space');
      cleanups.push(() => metaDesc?.setAttribute('content', prevDesc));

      // === OG / Twitter / 기타 동적 meta — 새로 만들고 cleanup에서 제거 ===
      const createdEls: Element[] = [];
      const addMeta = (attr: 'property' | 'name', key: string, content: string) => {
        if (!content) return;
        const el = document.createElement('meta');
        el.setAttribute(attr, key);
        el.setAttribute('content', content);
        document.head.appendChild(el);
        createdEls.push(el);
      };

      const pageUrl = window.location.href;
      addMeta('property', 'og:type', 'article');
      addMeta('property', 'og:url', pageUrl);
      addMeta('property', 'og:title', post.title);
      addMeta('property', 'og:description', post.summary || '');
      addMeta('property', 'og:site_name', 'My Space');
      if (post.coverImage) addMeta('property', 'og:image', post.coverImage);

      addMeta('name', 'twitter:card', 'summary_large_image');
      addMeta('name', 'twitter:title', post.title);
      addMeta('name', 'twitter:description', post.summary || '');
      if (post.coverImage) addMeta('name', 'twitter:image', post.coverImage);

      // === Schema.org JSON-LD (BlogPosting) ===
      const publishedIso = new Date(post.createdAt).toISOString();
      const jsonLd: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.summary || '',
        datePublished: publishedIso,
        dateModified: publishedIso,
        author: {
          '@type': 'Person',
          name: 'My Space',
        },
        publisher: {
          '@type': 'Organization',
          name: 'My Space',
          logo: {
            '@type': 'ImageObject',
            url: `${window.location.origin}/favicon.svg`,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': pageUrl,
        },
      };
      if (post.coverImage) jsonLd.image = post.coverImage;
      if (post.tags && post.tags.length > 0) jsonLd.keywords = post.tags.join(', ');

      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
      createdEls.push(script);

      cleanups.push(() => {
        createdEls.forEach((el) => el.parentNode?.removeChild(el));
      });

      // === Like state ===
      const liked = localStorage.getItem(`liked_${post.id}`);
      if (liked) setIsLiked(true);
      setLikes(post.likes || 0);
      setShowFloatingBar(true);

      return () => {
          cleanups.forEach((fn) => fn());
      };
  }, [post]);

  // Fetch related posts when 'post' changes
  useEffect(() => {
      if (!post) return;
      let cancelled = false;
      getRelatedPosts(post.id, post.tags ?? [], post.type, 3).then((related) => {
          if (!cancelled) setRelatedPosts(related);
      });
      return () => {
          cancelled = true;
      };
  }, [post]);

  // Record view (admin은 제외 — 본인 방문은 카운트하지 않음)
  useEffect(() => {
      if (!post || isAdmin) return;
      recordPostView(post.id);
  }, [post, isAdmin]);

  // 글을 못 찾는 경우 (삭제/비공개 draft 등) noindex 메타 추가 → Google이 soft 404로 인덱싱 안 함
  useEffect(() => {
      if (!error) return;
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      meta.setAttribute('content', 'noindex');
      document.head.appendChild(meta);
      return () => {
          meta.parentNode?.removeChild(meta);
      };
  }, [error]);

  const handleLike = async () => {
      if (!post) return;
      const newIsLiked = !isLiked;
      const newLikes = newIsLiked ? likes + 1 : likes - 1;
      
      setIsLiked(newIsLiked);
      setLikes(newLikes);
      setIsLikeAnimating(true);
      setTimeout(() => setIsLikeAnimating(false), 300);

      if (newIsLiked) localStorage.setItem(`liked_${post.id}`, 'true');
      else localStorage.removeItem(`liked_${post.id}`);

      try { await updatePostLikes(post.id, newLikes); } catch (e) { console.error("Failed to update likes", e); }
  };

  const handleShare = async () => {
      const url = window.location.href;
      
      try {
          // 1. Try modern API
          await navigator.clipboard.writeText(url);
          showFeedback();
      } catch (err) {
          // 2. Fallback for non-secure contexts (e.g. http://IP:3000)
          try {
              const textArea = document.createElement("textarea");
              textArea.value = url;
              textArea.style.position = "fixed"; // Avoid scrolling to bottom
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              const successful = document.execCommand('copy');
              document.body.removeChild(textArea);
              if (successful) showFeedback();
              else throw new Error("Copy failed");
          } catch (fallbackErr) {
              prompt("Copy this link:", url);
          }
      }
  };

  const showFeedback = () => {
      setShowCopyFeedback(true);
      setTimeout(() => setShowCopyFeedback(false), 2000);
  }

  const handleBack = () => {
      if (!post) {
          navigate('/');
          return;
      }
      if (post.type === 'gallery') navigate('/gallery');
      else if (post.type === 'playlist') navigate('/playlist');
      else if (post.type === 'blog') navigate('/blog');
      else navigate(-1);
  };

  if (isLoading) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center">
             <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
             <p className="text-slate-400 font-serif italic">Loading story...</p>
        </div>
      );
  }

  if (error || !post) {
      // 비로그인 상태 + Post not found = 십중팔구 비공개 초안. 로그인 안내로 분기.
      const looksLikeDraft = !isAdmin && error === 'Post not found';

      return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
              {looksLikeDraft ? (
                  <>
                      <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">로그인이 필요합니다</h2>
                      <p className="text-slate-500 mb-2">이 글은 비공개 초안일 수 있습니다.</p>
                      <p className="text-slate-400 text-sm mb-8">관리자 로그인 후 다시 시도해 주세요.</p>
                      <div className="flex gap-3">
                          {onOpenLogin && (
                              <button
                                  onClick={onOpenLogin}
                                  className="bg-black text-white px-6 py-3 rounded-full hover:bg-slate-800 transition-colors text-sm font-medium"
                              >
                                  Sign In
                              </button>
                          )}
                          <button
                              onClick={() => navigate('/')}
                              className="bg-white text-slate-700 border border-slate-300 px-6 py-3 rounded-full hover:bg-slate-50 transition-colors text-sm font-medium"
                          >
                              Go Home
                          </button>
                      </div>
                  </>
              ) : (
                  <>
                      <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">Post Not Found</h2>
                      <p className="text-slate-500 mb-8">{error || "The story you are looking for doesn't exist or has been removed."}</p>
                      <button
                          onClick={() => navigate('/')}
                          className="bg-black text-white px-6 py-3 rounded-full hover:bg-slate-800 transition-colors"
                      >
                          Go Home
                      </button>
                  </>
              )}
          </div>
      );
  }

  const contentImages = post.contentImages || (post.contentImage ? [post.contentImage] : []);
  const usedImageIndices = new Set<number>();

  const renderContent = () => {
      const parts = post.content.split(/(\[image-\d+\])/g);

      return parts.map((part, index) => {
          const match = part.match(/^\[image-(\d+)\]$/);

          if (match) {
              const imgIndex = parseInt(match[1]) - 1;
              if (contentImages[imgIndex]) {
                  usedImageIndices.add(imgIndex);
                  return (
                    <figure key={index} className="my-8 group relative block">
                        <img
                            src={contentImages[imgIndex]}
                            alt={`Content ${imgIndex + 1}`}
                            className="w-full h-auto rounded-lg shadow-md cursor-zoom-in"
                            onClick={() => setSelectedImage(contentImages[imgIndex])}
                        />
                         <figcaption className="text-center text-xs text-slate-400 mt-2 italic font-serif">
                             Image {imgIndex + 1}
                         </figcaption>
                    </figure>
                  );
              }
              return null;
          }

          if (!part.trim()) return null;

          return (
              <ReactMarkdown key={index} components={markdownComponents}>
                  {part}
              </ReactMarkdown>
          );
      });
  };

  const contentNodes = renderContent();
  const unusedImages = contentImages.filter((_, idx) => !usedImageIndices.has(idx));

  return (
    <>
        <div className="animate-fade-in pb-32">
            {/* Cinematic Header */}
            {post.coverImage ? (
                <div className="relative w-full h-[50vh] md:h-[60vh] -mt-8 md:-mt-12 mb-12">
                    <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70"></div>
                    
                    <button 
                        onClick={handleBack}
                        className="absolute top-8 left-4 md:left-8 text-white/80 hover:text-white flex items-center gap-2 bg-black/20 hover:bg-black/40 backdrop-blur-md px-4 py-2 rounded-full transition-all z-10"
                    >
                        <ChevronLeftIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Back</span>
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 max-w-7xl mx-auto w-full">
                        <div className="flex gap-2 mb-4">
                            <span className="bg-white/20 backdrop-blur-md border border-white/10 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                {post.type?.toUpperCase() || 'POST'}
                            </span>
                            {post.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="text-white/80 text-[10px] font-medium px-2 py-1 border border-white/20 rounded-full">#{tag}</span>
                            ))}
                        </div>
                        <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-2 leading-tight drop-shadow-lg">
                            {post.title}
                        </h1>
                         <div className="text-white/80 text-sm font-light flex items-center gap-3">
                            <span>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            {post.view_count !== undefined && post.view_count > 0 && (
                                <>
                                    <span className="opacity-50">·</span>
                                    <span>조회 {post.view_count.toLocaleString()}</span>
                                </>
                            )}
                         </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto px-4 mt-8 mb-12 border-b border-slate-100 pb-8">
                     <button 
                        onClick={handleBack}
                        className="text-slate-400 hover:text-black flex items-center gap-2 mb-8 transition-colors"
                    >
                        <ChevronLeftIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Back to list</span>
                    </button>
                    <div className="flex gap-2 mb-4">
                        <span className="text-indigo-600 font-bold text-xs uppercase tracking-widest">{post.type}</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-serif font-bold text-slate-900 mb-4 leading-tight">
                        {post.title}
                    </h1>
                    <div className="text-slate-400 text-sm font-light flex items-center gap-3">
                        <span>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        {post.view_count !== undefined && post.view_count > 0 && (
                            <>
                                <span className="opacity-50">·</span>
                                <span>조회 {post.view_count.toLocaleString()}</span>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="max-w-3xl mx-auto px-4">
                {/* Draft Badge */}
                {post.published === false && (
                    <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2">
                        <span className="font-bold tracking-wider text-xs uppercase">Draft</span>
                        <span className="text-xs">이 글은 초안 상태입니다. 본인에게만 보입니다.</span>
                    </div>
                )}

                {/* Admin Actions */}
                {isAdmin && (
                    <div className="flex justify-end gap-3 mb-6 items-center">
                        <button
                            onClick={async () => {
                                try {
                                    await togglePublished(post.id, !(post.published !== false));
                                    setPost({ ...post, published: !(post.published !== false) });
                                } catch (e) {
                                    console.error('Toggle publish failed:', e);
                                    alert('상태 변경 실패');
                                }
                            }}
                            className={`text-xs font-medium border-b border-transparent transition-colors pb-0.5 ${
                                post.published === false
                                    ? 'text-amber-600 hover:text-amber-800 hover:border-amber-600'
                                    : 'text-slate-400 hover:text-slate-700 hover:border-slate-700'
                            }`}
                        >
                            {post.published === false ? 'Publish Now' : 'Move to Drafts'}
                        </button>
                        <Link
                            to={`/edit/${post.id}`}
                            className="text-slate-400 hover:text-indigo-600 text-xs font-medium border-b border-transparent hover:border-indigo-600 transition-colors pb-0.5"
                        >
                            Edit Post
                        </Link>
                        {onDelete && (
                            <button
                                onClick={() => onDelete(post.id)}
                                className="text-slate-400 hover:text-red-600 text-xs font-medium border-b border-transparent hover:border-red-600 transition-colors pb-0.5 flex items-center gap-1"
                            >
                                <TrashIcon className="w-3 h-3" />
                                Delete
                            </button>
                        )}
                    </div>
                )}

                {/* Audio Player */}
                {post.audioUrl && (
                    <div className="mb-12 p-1 rounded-2xl bg-gradient-to-r from-indigo-100 to-rose-100">
                        <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl flex items-center gap-4">
                            <div className="bg-black text-white p-3 rounded-full shrink-0 animate-spin-slow">
                                <MusicIcon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 w-full min-w-0">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Audio Track</div>
                                <audio controls src={post.audioUrl} className="w-full h-8 focus:outline-none" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content (Parsed Text with Images) */}
                <div className="prose prose-lg prose-slate max-w-none font-light leading-loose text-slate-700">
                    {contentNodes}
                </div>

                {/* Gallery Grid for Unused Images */}
                {unusedImages.length > 0 && (
                    <div className="mt-20 pt-10 border-t border-slate-100">
                        <h3 className="text-2xl font-serif italic text-slate-900 mb-8 text-center">Visual Gallery</h3>
                        <div className="columns-2 gap-4 space-y-4">
                            {unusedImages.map((img, idx) => (
                                <div key={idx} className="break-inside-avoid rounded-xl overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity">
                                    <img 
                                        src={img} 
                                        alt={`Gallery ${idx}`} 
                                        className="w-full h-auto" 
                                        onClick={() => setSelectedImage(img)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Related Posts */}
                {relatedPosts.length > 0 && (
                    <div className="mt-20 pt-10 border-t border-slate-100">
                        <span className="text-xs font-bold tracking-widest text-indigo-500 uppercase mb-2 block">Related</span>
                        <h3 className="text-2xl font-serif font-medium text-slate-900 mb-8">이런 글도 어때요?</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {relatedPosts.map((rp) => (
                                <Link
                                    key={rp.id}
                                    to={`/p/${rp.id}`}
                                    className="group block"
                                >
                                    {rp.coverImage && (
                                        <div className="aspect-[16/10] rounded-lg overflow-hidden mb-3 bg-slate-100">
                                            <img
                                                src={rp.coverImage}
                                                alt={rp.title}
                                                loading="lazy"
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        </div>
                                    )}
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        {new Date(rp.createdAt).toLocaleDateString()}
                                    </div>
                                    <h4 className="font-serif text-lg font-medium text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-tight">
                                        {rp.title}
                                    </h4>
                                    <p className="text-sm text-slate-500 line-clamp-2 font-light leading-relaxed">
                                        {rp.summary}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bottom AdSense Area */}
                <div className="mt-24 pt-8 border-t border-slate-100">
                    <AdUnit type="banner" />
                </div>
            </div>
        </div>

        {/* Floating Bottom Dock */}
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 transform ${showFloatingBar ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur-xl border border-white/40 shadow-2xl shadow-slate-200/50 p-2 rounded-full ring-1 ring-slate-900/5">
                <button 
                    onClick={handleBack}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full hover:bg-black/5 transition-colors text-slate-600 hover:text-slate-900"
                    title="Back to List"
                >
                    <ListBulletIcon className="w-5 h-5" />
                    <span className="text-sm font-semibold">List</span>
                </button>
                
                <div className="w-px h-6 bg-slate-300/50 mx-1"></div>
                
                <button 
                    onClick={handleLike}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all active:scale-95 ${
                        isLiked 
                        ? 'bg-rose-50 text-rose-600' 
                        : 'hover:bg-rose-50 hover:text-rose-500 text-slate-600'
                    }`}
                    title="Like this post"
                >
                    <HeartIcon 
                        className={`w-5 h-5 transition-transform duration-300 ${isLiked ? 'fill-current scale-110' : 'scale-100'}`} 
                        solid={isLiked}
                    />
                    <span className="text-sm font-bold font-mono min-w-[1ch] text-center">{likes}</span>
                </button>

                <div className="w-px h-6 bg-slate-300/50 mx-1"></div>

                <button 
                    onClick={handleShare}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-black/5 transition-colors text-slate-600 hover:text-slate-900 relative"
                    title="Share Link"
                >
                    <ShareIcon className="w-5 h-5" />
                    {showCopyFeedback && (
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black text-white text-xs py-1 px-3 rounded shadow-lg whitespace-nowrap animate-fade-in pointer-events-none">
                            Link Copied!
                        </span>
                    )}
                </button>
            </div>
        </div>

        {/* Lightbox Modal */}
        {selectedImage && (
            <div 
                className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                onClick={() => setSelectedImage(null)}
            >
                <button 
                    className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full p-2 transition-colors z-[101]"
                    onClick={() => setSelectedImage(null)}
                >
                    <XMarkIcon className="w-8 h-8" />
                </button>
                <img 
                    src={selectedImage} 
                    alt="Fullscreen view" 
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()} // Prevent close on image click
                />
            </div>
        )}
    </>
  );
};

export default PostDetail;
