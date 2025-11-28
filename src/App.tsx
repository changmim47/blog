
import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { BlogPost } from './types';
import PostList from './components/PostList';
import Editor from './components/Editor';
import PostDetail from './components/PostDetail';
import Dashboard from './components/Dashboard';
import PrivacyPolicy from './components/PrivacyPolicy';
import About from './components/About';
import NotFound from './components/NotFound';
import { PenIcon, LockClosedIcon, LockOpenIcon, MagnifyingGlassIcon, XMarkIcon } from './components/Icons';
import AdUnit from './components/AdUnit';
import * as storage from './services/storage';
import { supabase, checkConnection } from './services/supabaseClient';

function App() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  
  // Admin State (Supabase Auth)
  const [isAdmin, setIsAdmin] = useState(false);

  // Visitor Stats
  const [visitorStats, setVisitorStats] = useState({ today: 0, total: 0 });

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Check initial configuration and load posts
  useEffect(() => {
    const init = async () => {
      const isConnected = await checkConnection();
      if (!isConnected) {
        setIsConfigured(false);
        setIsInitializing(false);
        return;
      }

      // 1. Check Admin Session
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserIsAdmin = !!session;
      setIsAdmin(currentUserIsAdmin);

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsAdmin(!!session);
      });

      // 2. Record Visit (If NOT Admin & Not recorded in this session)
      if (!currentUserIsAdmin) {
          const hasVisited = sessionStorage.getItem('has_recorded_visit');
          if (!hasVisited) {
              await storage.recordVisit();
              sessionStorage.setItem('has_recorded_visit', 'true');
          }
      }

      // 3. Load Visitor Stats
      try {
          const stats = await storage.getVisitorStats();
          setVisitorStats(stats);
      } catch (e) {
          console.error("Failed to load stats", e);
      }

      // 4. Load Posts
      try {
        const loadedPosts = await storage.getAllPosts();
        setPosts(loadedPosts);
      } catch (e) {
        console.error("Failed to load posts", e);
      } finally {
        setIsInitializing(false);
      }

      return () => subscription.unsubscribe();
    };

    init();
  }, []);

  const refreshPosts = async () => {
      const updatedPosts = await storage.getAllPosts();
      setPosts(updatedPosts);
  }

  const handleSavePost = async (post: BlogPost) => {
    try {
        await storage.savePost(post);
        await refreshPosts();
        // Navigate based on type
        if (post.type === 'gallery') navigate('/gallery');
        else if (post.type === 'playlist') navigate('/playlist');
        else navigate('/blog');
    } catch (e) {
        alert('저장에 실패했습니다.');
    }
  };

  const handleDeletePost = async (e: React.MouseEvent | null, id: string) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault(); 
      }
      
      if(confirm('정말 이 글을 삭제하시겠습니까?')) {
          try {
            await storage.deletePost(id);
            await refreshPosts();
            // If on detail page, go home, otherwise refresh list
            if (location.pathname.includes('/p/')) {
                navigate('/');
            }
          } catch(e) {
              alert('삭제 중 오류가 발생했습니다.');
          }
      }
  }

  const handleLogin = async () => {
      const email = prompt('이메일을 입력하세요:');
      if (!email) return;
      const password = prompt('비밀번호를 입력하세요:');
      if (!password) return;

      const { error } = await supabase.auth.signInWithPassword({
          email,
          password
      });

      if (error) {
          alert('로그인 실패: ' + error.message);
      }
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
      alert('로그아웃 되었습니다.');
      navigate('/');
  };

  // Determine Write Link based on current section
  const getWriteLink = () => {
      const path = location.pathname;
      if (path.includes('/playlist')) return '/write?type=playlist';
      if (path.includes('/blog')) return '/write?type=blog';
      // Default to gallery for home and gallery pages
      return '/write?type=gallery';
  };

  // Filter posts based on search term
  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    post.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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

                        {/* Write Button - Only visible to Admin */}
                        {isAdmin && (
                            <Link
                            to={getWriteLink()}
                            className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-full hover:bg-gray-800 transition-all transform hover:scale-105 shadow-lg shadow-gray-200"
                            >
                            <PenIcon className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold uppercase tracking-wider">Write</span>
                            </Link>
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
            <div className="md:hidden flex border-t border-slate-100/50">
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
                            "{searchTerm}" <span className="text-slate-400">({filteredPosts.length})</span>
                        </h2>
                    </div>
                    <button onClick={() => setSearchTerm('')} className="text-sm text-slate-400 hover:text-black underline">Clear Search</button>
                </div>
                <PostList posts={filteredPosts} section="blog" onDeletePost={handleDeletePost} isAdmin={isAdmin} />
            </div>
        )}

        {/* Normal Content (Hidden when searching) */}
        {!searchTerm && (
            <Routes>
                {/* Dashboard Home */}
                <Route path="/" element={<Dashboard posts={posts} />} />
                
                {/* Gallery Page */}
                <Route path="/gallery" element={
                    <div className="animate-fade-in-up">
                        <header className="mb-16 mt-8 text-center relative">
                            <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">Gallery</h2>
                            <div className="w-16 h-1 bg-black mx-auto mb-6"></div>
                            <p className="text-slate-500 text-lg font-light italic font-serif">Moments frozen in time.</p>
                        </header>
                        <PostList posts={posts.filter(p => p.type === 'gallery')} section="gallery" onDeletePost={handleDeletePost} isAdmin={isAdmin} />
                    </div>
                } />
                
                {/* Playlist Page */}
                <Route path="/playlist" element={
                    <div className="animate-fade-in-up">
                        <header className="mb-16 mt-8 text-center relative">
                            <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">Playlist</h2>
                            <div className="w-16 h-1 bg-black mx-auto mb-6"></div>
                            <p className="text-slate-500 text-lg font-light italic font-serif">Curated sounds & vibes.</p>
                        </header>
                        <PostList posts={posts.filter(p => p.type === 'playlist' || !p.type)} section="playlist" onDeletePost={handleDeletePost} isAdmin={isAdmin} />
                    </div>
                } />
                
                {/* Blog Page */}
                <Route path="/blog" element={
                    <div className="animate-fade-in-up">
                        <header className="mb-16 mt-8 text-center relative">
                            <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">Journal</h2>
                            <div className="w-16 h-1 bg-black mx-auto mb-6"></div>
                            <p className="text-slate-500 text-lg font-light italic font-serif">Thoughts, stories, and reflections.</p>
                        </header>
                        <PostList posts={posts.filter(p => p.type === 'blog')} section="blog" onDeletePost={handleDeletePost} isAdmin={isAdmin} />
                    </div>
                } />

                {/* Post Detail Page */}
                <Route path="/p/:id" element={
                    <PostDetail posts={posts} isAdmin={isAdmin} onDelete={(id) => handleDeletePost(null, id)} />
                } />

                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/about" element={<About />} />

                <Route path="/write" element={
                    isAdmin ? <Editor defaultType="gallery" onSave={handleSavePost} onCancel={() => navigate(-1)} /> : <div className="text-center py-20">Access Denied</div>
                } />

                <Route path="/edit/:id" element={
                    isAdmin ? <Editor defaultType="gallery" onSave={handleSavePost} onCancel={() => navigate(-1)} isEdit /> : <div className="text-center py-20">Access Denied</div>
                } />
                
                {/* 404 Page Not Found */}
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
          
          <button 
            onClick={isAdmin ? handleLogout : handleLogin}
            className="text-slate-300 hover:text-slate-600 transition-colors text-xs flex items-center gap-2 group"
          >
             {isAdmin ? (
                 <>
                     <LockOpenIcon className="w-3 h-3 group-hover:text-indigo-600" />
                     <span>Sign out</span>
                 </>
             ) : (
                 <>
                     <LockClosedIcon className="w-3 h-3" />
                     <span>Admin</span>
                 </>
             )}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
