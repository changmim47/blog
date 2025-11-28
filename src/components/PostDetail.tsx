
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BlogPost } from '../types';
import { ChevronLeftIcon, MusicIcon, XMarkIcon, ArrowsPointingOutIcon, HeartIcon, ListBulletIcon, ShareIcon, TrashIcon } from './Icons';
import AdUnit from './AdUnit';
import { updatePostLikes, getPostById } from '../services/storage';

interface PostDetailProps {
  posts: BlogPost[];
  isAdmin: boolean;
  onDelete?: (id: string) => void;
}

const PostDetail: React.FC<PostDetailProps> = ({ posts, isAdmin, onDelete }) => {
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

        // 1. Try finding in props first (fastest)
        const foundInProps = posts.find(p => p.id === id);
        
        if (foundInProps) {
            setPost(foundInProps);
            setIsLoading(false);
        } else {
            // 2. If not in props (e.g. refresh), fetch from server
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
        }
      };

      initPost();
  }, [id, posts]);

  // Update SEO and Like state when 'post' is set
  useEffect(() => {
      if (!post) return;

      // SEO: Update Title & Description
      document.title = `${post.title} | My Space`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', post.summary || 'A post on My Space');

      // SEO: Update Open Graph
      let metaOgTitle = document.querySelector('meta[property="og:title"]');
      if (!metaOgTitle) {
            metaOgTitle = document.createElement('meta');
            metaOgTitle.setAttribute('property', 'og:title');
            document.head.appendChild(metaOgTitle);
      }
      metaOgTitle.setAttribute('content', post.title);
      
      if (post.coverImage) {
            let metaOgImage = document.querySelector('meta[property="og:image"]');
            if (!metaOgImage) {
                metaOgImage = document.createElement('meta');
                metaOgImage.setAttribute('property', 'og:image');
                document.head.appendChild(metaOgImage);
            }
            metaOgImage.setAttribute('content', post.coverImage);
      }

      const liked = localStorage.getItem(`liked_${post.id}`);
      if (liked) setIsLiked(true);
      setLikes(post.likes || 0);
      setShowFloatingBar(true);

      return () => {
          document.title = "My Space";
      }
  }, [post]);

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
      return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
              <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">Post Not Found</h2>
              <p className="text-slate-500 mb-8">{error || "The story you are looking for doesn't exist or has been removed."}</p>
              <button 
                onClick={() => navigate('/')}
                className="bg-black text-white px-6 py-3 rounded-full hover:bg-slate-800 transition-colors"
              >
                  Go Home
              </button>
          </div>
      );
  }

  const contentImages = post.contentImages || ((post as any).contentImage ? [(post as any).contentImage] : []);
  const usedImageIndices = new Set<number>();

  const renderLine = (text: string, key: string | number) => {
      const h1Match = text.match(/^# (.*)/);
      if (h1Match) return <h2 key={key} className="text-3xl font-bold text-slate-800 mt-8 mb-4">{parseInline(h1Match[1])}</h2>;

      const h2Match = text.match(/^## (.*)/);
      if (h2Match) return <h3 key={key} className="text-2xl font-bold text-slate-800 mt-6 mb-3">{parseInline(h2Match[1])}</h3>;

      const quoteMatch = text.match(/^> (.*)/);
      if (quoteMatch) return <blockquote key={key} className="border-l-4 border-indigo-300 pl-4 italic text-slate-600 my-4 bg-slate-50 py-2 pr-2">{parseInline(quoteMatch[1])}</blockquote>;

      if (!text.trim()) return <br key={key} />;
      return <p key={key} className="mb-4 leading-loose">{parseInline(text)}</p>;
  };

  const parseInline = (text: string): React.ReactNode => {
      const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
      return parts.map((part, idx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={idx} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
              return <em key={idx} className="italic text-slate-800">{part.slice(1, -1)}</em>;
          }
          return part;
      });
  };

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
          } else {
              const lines = part.split('\n');
              return (
                  <div key={index}>
                      {lines.map((line, lineIdx) => renderLine(line, `${index}-${lineIdx}`))}
                  </div>
              )
          }
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
                         <div className="text-white/80 text-sm font-light">
                            {new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
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
                    <div className="text-slate-400 text-sm font-light">
                        {new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>
            )}

            <div className="max-w-3xl mx-auto px-4">
                {/* Admin Actions */}
                {isAdmin && (
                    <div className="flex justify-end gap-3 mb-6">
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
