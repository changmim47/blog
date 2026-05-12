
import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { BlogPost } from './types';
import PostList from './components/PostList';
import Editor from './components/Editor';
import PostDetail from './components/PostDetail';
import Dashboard from './components/Dashboard';
import PrivacyPolicy from './components/PrivacyPolicy';
import About from './components/About';
import NotFound from './components/NotFound';
import LoginModal from './components/LoginModal';
import SectionPage from './components/SectionPage';
import Drafts from './components/Drafts';
import AdminRuns from './components/AdminRuns';
import { PenIcon, LockOpenIcon, MagnifyingGlassIcon, XMarkIcon } from './components/Icons';
import * as storage from './services/storage';
import { supabase, checkConnection } from './services/supabaseClient';

// Hidden login route. Going to /login auto-opens the login modal.
// Already-admin users get redirected home. After successful login, isAdmin flips and we redirect.
function LoginRoute({ isAdmin, onOpenLogin }: { isAdmin: boolean; onOpenLogin: () => void }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (isAdmin) {
      navigate('/', { replace: true });
    } else {
      onOpenLogin();
    }
  }, [isAdmin, navigate, onOpenLogin]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  );
}

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);

  // Refresh trigger (incremented after save/delete to invalidate paginated views)
  const [refreshKey, setRefreshKey] = useState(0);

  // Admin State (Supabase Auth)
  const [isAdmin, setIsAdmin] = useState(false);

  // Visitor Stats
  const [visitorStats, setVisitorStats] = useState({ today: 0, total: 0 });

  // Search State (lazy-loaded — fetched only when user opens search)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchablePosts, setSearchablePosts] = useState<BlogPost[] | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  // Login Modal State
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Canonical URL — 매 경로 변경 시 정식 도메인 + 경로로 설정.
  // GSC가 www 있는/없는, HTTP/HTTPS 변형을 동일 페이지로 인식하게 함.
  useEffect(() => {
    const CANONICAL_BASE = 'https://daily-memorylog.com';
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', `${CANONICAL_BASE}${location.pathname}`);
  }, [location.pathname]);

  // Google AdSense 스크립트 lazy 로드 — VITE_ADSENSE_CLIENT 설정 시에만.
  // 한 번만 로드 (id로 중복 체크).
  useEffect(() => {
    const adsenseClient = import.meta.env.VITE_ADSENSE_CLIENT;
    if (!adsenseClient) return;
    if (document.getElementById('adsbygoogle-loader')) return;
    const script = document.createElement('script');
    script.id = 'adsbygoogle-loader';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`;
    document.head.appendChild(script);
  }, []);

  // Keyboard shortcut to open login modal — Cmd/Ctrl + Shift + L
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (!isAdmin) setIsLoginModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin]);

  // Initial setup: connection check, auth, visitor stats (no post pre-loading)
  useEffect(() => {
    let authSubscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      const isConnected = await checkConnection();
      if (!isConnected) {
        setIsConfigured(false);
        setIsInitializing(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const currentUserIsAdmin = !!session;
      setIsAdmin(currentUserIsAdmin);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setIsAdmin(!!newSession);
      });
      authSubscription = subscription;

      if (!currentUserIsAdmin) {
        const hasVisited = sessionStorage.getItem('has_recorded_visit');
        if (!hasVisited) {
          await storage.recordVisit();
          sessionStorage.setItem('has_recorded_visit', 'true');
        }
      }

      try {
        const stats = await storage.getVisitorStats();
        setVisitorStats(stats);
      } catch (e) {
        console.error('Failed to load stats', e);
      }

      setIsInitializing(false);
    };

    init();

    return () => {
      authSubscription?.unsubscribe();
    };
  }, []);

  // Lazy-load all posts when search is opened (cached for the session)
  useEffect(() => {
    if (!isSearchOpen || searchablePosts !== null) return;
    setIsSearchLoading(true);
    storage.getAllPosts()
      .then((all) => setSearchablePosts(all))
      .catch((e) => console.error('Failed to load posts for search', e))
      .finally(() => setIsSearchLoading(false));
  }, [isSearchOpen, searchablePosts]);

  const handleSavePost = async (post: BlogPost) => {
    try {
      await storage.savePost(post);
      setRefreshKey((k) => k + 1);
      setSearchablePosts(null); // invalidate search cache
      if (post.type === 'gallery') navigate('/gallery');
      else if (post.type === 'playlist') navigate('/playlist');
      else navigate('/blog');
    } catch (e) {
      console.error('Save error:', e);
      alert('저장에 실패했습니다.');
    }
  };

  const handleDeletePost = async (e: React.MouseEvent | null, id: string) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (confirm('정말 이 글을 삭제하시겠습니까?')) {
      try {
        await storage.deletePost(id);
        setRefreshKey((k) => k + 1);
        setSearchablePosts(null);
        if (location.pathname.includes('/p/')) {
          navigate('/');
        }
      } catch (e) {
        console.error('Delete error:', e);
        alert('삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const filteredSearchResults = useMemo(() => {
    if (!searchTerm || !searchablePosts) return [];
    const term = searchTerm.toLowerCase();
    return searchablePosts.filter((post) =>
      post.title.toLowerCase().includes(term) ||
      post.tags.some((tag) => tag.toLowerCase().includes(term))
    );
  }, [searchTerm, searchablePosts]);

  const handleLoginSubmit = async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? error.message : null };
  };

  const handleLogout = async () => {
      // 1. Supabase 표준 로그아웃 (scope: 'local' = 서버 호출 없이 로컬만 정리,
      //    사파리가 네트워크 호출을 막거나 느릴 때 더 안정적)
      try {
          await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
          console.error('Logout error:', e);
      }

      // 2. 사파리 ITP 안전장치 — Supabase 세션 키를 localStorage에서 강제 제거.
      //    signOut이 어떤 이유로 실패해도 다음 로드에서 절대 자동 로그인 못 하게.
      try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
                  localStorage.removeItem(key);
              }
          }
      } catch (e) {
          console.error('Storage cleanup error:', e);
      }

      // 3. 강제 새로고침
      window.location.href = '/';
  };

  // Determine Write Link based on current section
  const getWriteLink = () => {
      const path = location.pathname;
      if (path.includes('/playlist')) return '/write?type=playlist';
      if (path.includes('/blog')) return '/write?type=blog';
      // Default to gallery for home and gallery pages
      return '/write?type=gallery';
  };

  if (isInitializing) {
      return (
          <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
              <div className="flex flex-col items-center">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                  <div className="text-slate-400 text-sm tracking-wider font-serif italic">Loading your space...</div>
              </div>
          </div>
      )
  }

  if (!isConfigured) {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
              <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100">
                  <h2 className="text-2xl font-bold text-slate-800 mb-4 font-serif">Setup Required</h2>
                  <p className="text-slate-600 mb-6 text-sm leading-relaxed">
                      Supabase configuration is missing. Please check your <code>services/supabaseClient.ts</code> file.
                  </p>
                  <button onClick={() => window.location.reload()} className="bg-black text-white px-6 py-3 rounded-full hover:bg-gray-800 transition-all w-full text-sm font-medium">
                      Reload
                  </button>
              </div>
          </div>
      )
  }

  const currentPath = location.pathname;

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-[#FAFAFA]/80 backdrop-blur-xl border-b border-slate-200/50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {isSearchOpen ? (
                <div className="w-full flex items-center animate-fade-in">
                    <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 mr-3" />
                    <input 
                        type="text" 
                        autoFocus
                        placeholder="Search posts or tags..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-grow bg-transparent border-none outline-none text-lg text-slate-800 placeholder-slate-400"
                    />
                    <button 
                        onClick={() => {
                            setIsSearchOpen(false);
                            setSearchTerm('');
                        }}
                        className="ml-3 p-1 rounded-full hover:bg-slate-200 text-slate-500"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            ) : (
                <>
                    <Link 
                        to="/"
                        className="flex items-center cursor-pointer group"
                    >
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center mr-3 group-hover:scale-110 transition-transform duration-300">
                        <span className="text-white font-serif font-bold text-lg">M</span>
                    </div>
                    <h1 className="text-xl font-serif font-bold tracking-tight text-slate-900">
                        My Space
                    </h1>
                    </Link>
                    
                    {/* Desktop Menu */}
                    <div className="hidden md:flex space-x-10 items-center">
                        <Link 
                            to="/gallery"
                            className={`text-sm font-medium transition-all tracking-wide ${currentPath.includes('/gallery') ? 'text-black font-semibold' : 'text-slate-500 hover:text-black'}`}
                        >
                            Gallery
                        </Link>
                        <Link 
                            to="/playlist"
                            className={`text-sm font-medium transition-all tracking-wide ${currentPath.includes('/playlist') ? 'text-black font-semibold' : 'text-slate-500 hover:text-black'}`}
                        >
                            Playlist
                        </Link>
                        <Link 
                            to="/blog"
                            className={`text-sm font-medium transition-all tracking-wide ${currentPath.includes('/blog') ? 'text-black font-semibold' : 'text-slate-500 hover:text-black'}`}
                        >
                            Blog
                        </Link>
                        
                        {/* Search Icon */}
                        <button 
                            onClick={() => setIsSearchOpen(true)}
                            className="text-slate-400 hover:text-black transition-colors"
                        >
                            <MagnifyingGlassIcon className="w-5 h-5" />
                        </button>

                        {/* Admin-only Links */}
                        {isAdmin && (
                            <>
                                <Link
                                    to="/drafts"
                                    className={`text-sm font-medium transition-all tracking-wide ${currentPath.includes('/drafts') ? 'text-amber-600 font-semibold' : 'text-slate-500 hover:text-amber-600'}`}
                                >
                                    Drafts
                                </Link>
                                <Link
                                    to="/admin/runs"
                                    className={`text-sm font-medium transition-all tracking-wide ${currentPath.includes('/admin/runs') ? 'text-indigo-600 font-semibold' : 'text-slate-500 hover:text-indigo-600'}`}
                                >
                                    Runs
                                </Link>
                                <Link
                                    to={getWriteLink()}
                                    className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-full hover:bg-gray-800 transition-all transform hover:scale-105 shadow-lg shadow-gray-200"
                                >
                                    <PenIcon className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Write</span>
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Mobile Controls */}
                    <div className="md:hidden flex items-center gap-4">
                        <button 
                            onClick={() => setIsSearchOpen(true)}
                            className="text-slate-400 hover:text-black transition-colors"
                        >
                            <MagnifyingGlassIcon className="w-5 h-5" />
                        </button>
                        {isAdmin && (
                             <Link to={getWriteLink()} className="bg-black text-white p-2 rounded-full">
                                 <PenIcon className="w-4 h-4" />
                             </Link>
                        )}
                    </div>
                </>
            )}
          </div>
        </div>
        
        {/* Mobile Menu */}
        {!isSearchOpen && (
            <div className="md:hidden">
                <div className="flex border-t border-slate-100/50">
                    <Link
                        to="/gallery"
                        className={`flex-1 py-4 text-xs font-medium text-center uppercase tracking-widest ${currentPath.includes('/gallery') ? 'text-black bg-white' : 'text-slate-400'}`}
                    >
                        Gallery
                    </Link>
                    <Link
                        to="/playlist"
                        className={`flex-1 py-4 text-xs font-medium text-center uppercase tracking-widest ${currentPath.includes('/playlist') ? 'text-black bg-white' : 'text-slate-400'}`}
                    >
                        Playlist
                    </Link>
                    <Link
                        to="/blog"
                        className={`flex-1 py-4 text-xs font-medium text-center uppercase tracking-widest ${currentPath.includes('/blog') ? 'text-black bg-white' : 'text-slate-400'}`}
                    >
                        Journal
                    </Link>
                </div>
                {isAdmin && (
                    <div className="flex border-t border-slate-100/50 bg-slate-50/50">
                        <Link
                            to="/drafts"
                            className={`flex-1 py-3 text-[11px] font-medium text-center uppercase tracking-widest ${currentPath.includes('/drafts') ? 'text-amber-700 bg-white' : 'text-slate-500'}`}
                        >
                            Drafts
                        </Link>
                        <Link
                            to="/admin/runs"
                            className={`flex-1 py-3 text-[11px] font-medium text-center uppercase tracking-widest ${currentPath.includes('/admin/runs') ? 'text-indigo-700 bg-white' : 'text-slate-500'}`}
                        >
                            Runs
                        </Link>
                    </div>
                )}
            </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8 md:py-12">
        
        {/* Search Results Overlay */}
        {searchTerm && (
            <div className="mb-12 animate-fade-in">
                <div className="flex justify-between items-end border-b border-slate-200 pb-4 mb-8">
                     <div>
                        <span className="text-xs font-bold tracking-widest text-indigo-500 uppercase mb-1 block">Search Results</span>
                        <h2 className="text-3xl font-serif font-medium text-slate-900">
                            "{searchTerm}" {!isSearchLoading && <span className="text-slate-400">({filteredSearchResults.length})</span>}
                        </h2>
                    </div>
                    <button onClick={() => setSearchTerm('')} className="text-sm text-slate-400 hover:text-black underline">Clear Search</button>
                </div>
                {isSearchLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <PostList posts={filteredSearchResults} section="blog" onDeletePost={handleDeletePost} isAdmin={isAdmin} />
                )}
            </div>
        )}

        {/* Normal Content (Hidden when searching) */}
        {!searchTerm && (
            <Routes>
                <Route path="/" element={<Dashboard refreshKey={refreshKey} />} />

                <Route path="/gallery" element={
                    <SectionPage
                        type="gallery"
                        title="Gallery"
                        subtitle="Moments frozen in time."
                        isAdmin={isAdmin}
                        onDeletePost={handleDeletePost}
                        refreshKey={refreshKey}
                    />
                } />

                <Route path="/playlist" element={
                    <SectionPage
                        type="playlist"
                        title="Playlist"
                        subtitle="Curated sounds & vibes."
                        isAdmin={isAdmin}
                        onDeletePost={handleDeletePost}
                        refreshKey={refreshKey}
                    />
                } />

                <Route path="/blog" element={
                    <SectionPage
                        type="blog"
                        title="Journal"
                        subtitle="Thoughts, stories, and reflections."
                        isAdmin={isAdmin}
                        onDeletePost={handleDeletePost}
                        refreshKey={refreshKey}
                    />
                } />

                <Route path="/p/:id" element={
                    <PostDetail
                        isAdmin={isAdmin}
                        onDelete={(id) => handleDeletePost(null, id)}
                        onOpenLogin={() => setIsLoginModalOpen(true)}
                    />
                } />

                <Route path="/drafts" element={
                    isAdmin ? <Drafts refreshKey={refreshKey} onDeletePost={handleDeletePost} /> : <div className="text-center py-20">Access Denied</div>
                } />

                <Route path="/admin/runs" element={
                    isAdmin ? <AdminRuns /> : <div className="text-center py-20">Access Denied</div>
                } />

                <Route path="/login" element={<LoginRoute isAdmin={isAdmin} onOpenLogin={() => setIsLoginModalOpen(true)} />} />

                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/about" element={<About />} />

                <Route path="/write" element={
                    isAdmin ? <Editor defaultType="gallery" onSave={handleSavePost} onCancel={() => navigate(-1)} /> : <div className="text-center py-20">Access Denied</div>
                } />

                <Route path="/edit/:id" element={
                    isAdmin ? <Editor defaultType="gallery" onSave={handleSavePost} onCancel={() => navigate(-1)} isEdit /> : <div className="text-center py-20">Access Denied</div>
                } />

                <Route path="*" element={<NotFound />} />

            </Routes>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-12 mt-auto bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
              <h3 className="font-serif font-bold text-lg mb-2">My Space</h3>
              <div className="flex flex-col md:flex-row gap-4 text-xs text-slate-400 font-light">
                  <p>© {new Date().getFullYear()} All rights reserved.</p>
                  
                  {/* Visitor Stats (Desktop) */}
                  <div className="hidden md:block w-px h-3 bg-slate-300 my-auto"></div>
                  <div className="hidden md:flex gap-4 justify-center font-mono text-[10px] tracking-wide text-slate-500">
                      <span>Today: <span className="text-slate-700 font-bold">{visitorStats.today}</span></span>
                      <span>Total: <span className="text-slate-700 font-bold">{visitorStats.total}</span></span>
                  </div>

                  <div className="hidden md:block w-px h-3 bg-slate-300 my-auto"></div>
                  <div className="flex gap-4 justify-center">
                    <Link to="/about" className="hover:text-slate-600 transition-colors">About</Link>
                    <Link to="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
                  </div>
              </div>
          </div>

          {/* Visitor Stats (Mobile) */}
          <div className="md:hidden flex gap-4 font-mono text-xs text-slate-500 border-t border-b border-slate-50 py-2 w-full justify-center bg-slate-50/50">
              <span>Today: <b>{visitorStats.today}</b></span>
              <span className="text-slate-300">|</span>
              <span>Total: <b>{visitorStats.total}</b></span>
          </div>
          
          {/* Sign out button — only visible when admin is logged in.
              Login UI is intentionally hidden from anonymous visitors (security).
              Admin can sign in via /login URL (bookmarkable) or Cmd/Ctrl+Shift+L shortcut. */}
          {isAdmin && (
            <button
              onClick={handleLogout}
              aria-label="Sign out from admin"
              className="text-slate-300 hover:text-slate-600 transition-colors text-xs flex items-center gap-2 group"
            >
              <LockOpenIcon className="w-3 h-3 group-hover:text-indigo-600" />
              <span>Sign out</span>
            </button>
          )}
        </div>
      </footer>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSubmit={handleLoginSubmit}
      />
    </div>
  );
}

export default App;
