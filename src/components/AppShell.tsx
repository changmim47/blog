'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { BlogPost } from '../types';
import { SITE } from '../constants/author';
import * as storage from '../services/storage';
import { supabase } from '../services/supabaseClient';
import { LockOpenIcon, MagnifyingGlassIcon, PenIcon, XMarkIcon } from './Icons';
import LoginModal from './LoginModal';
import PostList from './PostList';
import { AdminContext } from './AdminContext';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [visitorStats, setVisitorStats] = useState({ today: 0, total: 0 });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchablePosts, setSearchablePosts] = useState<BlogPost[] | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setIsAdmin(Boolean(session));
      if (!session && !sessionStorage.getItem('has_recorded_visit')) {
        storage.recordVisit().finally(() =>
          sessionStorage.setItem('has_recorded_visit', 'true'),
        );
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(Boolean(session));
      router.refresh();
    });
    unsubscribe = () => data.subscription.unsubscribe();

    storage.getVisitorStats().then(setVisitorStats).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        if (!isAdmin) setIsLoginModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin]);

  useEffect(() => {
    if (!isSearchOpen || searchablePosts !== null) return;
    setIsSearchLoading(true);
    storage.getAllPosts()
      .then(setSearchablePosts)
      .catch(() => setSearchablePosts([]))
      .finally(() => setIsSearchLoading(false));
  }, [isSearchOpen, searchablePosts]);

  const filteredSearchResults = useMemo(() => {
    if (!searchTerm || !searchablePosts) return [];
    const term = searchTerm.toLowerCase();
    return searchablePosts.filter(
      (post) =>
        post.title.toLowerCase().includes(term) ||
        (post.tags ?? []).some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [searchTerm, searchablePosts]);

  const getWriteLink = () => {
    if (pathname.includes('/playlist')) return '/write?type=playlist';
    if (pathname.includes('/blog')) return '/write?type=blog';
    return '/write?type=gallery';
  };

  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm('정말 이 글을 삭제하시겠습니까?')) return;
    await storage.deletePost(id);
    setSearchablePosts(null);
    router.refresh();
  };

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.assign('/');
  };

  return (
    <AdminContext.Provider value={isAdmin}>
      <div className="min-h-screen flex flex-col font-sans text-slate-900">
        <nav className="sticky top-0 z-40 bg-[#FAFAFA]/80 backdrop-blur-xl border-b border-slate-200/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-20">
              {isSearchOpen ? (
                <div className="w-full flex items-center animate-fade-in">
                  <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 mr-3" />
                  <input
                    type="search"
                    autoFocus
                    aria-label="게시글 검색"
                    placeholder="Search posts or tags..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="flex-grow bg-transparent border-none outline-none text-lg text-slate-800 placeholder-slate-400"
                  />
                  <button
                    type="button"
                    aria-label="검색 닫기"
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
                  <Link href="/" className="flex items-center group">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                      <span className="text-white font-serif font-bold text-lg">D</span>
                    </div>
                    <span className="text-xl font-serif font-bold tracking-tight text-slate-900">
                      {SITE.name}
                    </span>
                  </Link>

                  <div className="hidden md:flex space-x-10 items-center">
                    {[
                      ['/gallery', 'Gallery'],
                      ['/playlist', 'Playlist'],
                      ['/blog', 'Blog'],
                    ].map(([href, label]) => (
                      <Link
                        key={href}
                        href={href}
                        className={`text-sm font-medium transition-all tracking-wide ${pathname.includes(href) ? 'text-black font-semibold' : 'text-slate-500 hover:text-black'}`}
                      >
                        {label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      aria-label="검색 열기"
                      onClick={() => setIsSearchOpen(true)}
                      className="text-slate-400 hover:text-black transition-colors"
                    >
                      <MagnifyingGlassIcon className="w-5 h-5" />
                    </button>
                    {isAdmin && (
                      <>
                        <Link href="/drafts" className="text-sm text-slate-500 hover:text-amber-600">Drafts</Link>
                        <Link href="/admin/runs" className="text-sm text-slate-500 hover:text-indigo-600">Runs</Link>
                        <Link href="/admin/youtube" className="text-sm text-slate-500 hover:text-red-600">YouTube</Link>
                        <Link href={getWriteLink()} className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-full hover:bg-gray-800 shadow-lg shadow-gray-200">
                          <PenIcon className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold uppercase tracking-wider">Write</span>
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="md:hidden flex items-center gap-4">
                    <button type="button" aria-label="검색 열기" onClick={() => setIsSearchOpen(true)} className="text-slate-400">
                      <MagnifyingGlassIcon className="w-5 h-5" />
                    </button>
                    {isAdmin && (
                      <Link href={getWriteLink()} className="bg-black text-white p-2 rounded-full">
                        <PenIcon className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {!isSearchOpen && (
            <div className="md:hidden flex border-t border-slate-100/50">
              {[
                ['/gallery', 'Gallery'],
                ['/playlist', 'Playlist'],
                ['/blog', 'Journal'],
              ].map(([href, label]) => (
                <Link key={href} href={href} className={`flex-1 py-4 text-xs font-medium text-center uppercase tracking-widest ${pathname.includes(href) ? 'text-black bg-white' : 'text-slate-400'}`}>
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8 md:py-12">
          {searchTerm ? (
            <section className="mb-12 animate-fade-in" aria-label="검색 결과">
              <div className="flex justify-between items-end border-b border-slate-200 pb-4 mb-8">
                <div>
                  <span className="text-xs font-bold tracking-widest text-indigo-500 uppercase mb-1 block">Search Results</span>
                  <h1 className="text-3xl font-serif font-medium text-slate-900">
                    &quot;{searchTerm}&quot; {!isSearchLoading && <span className="text-slate-400">({filteredSearchResults.length})</span>}
                  </h1>
                </div>
                <button type="button" onClick={() => setSearchTerm('')} className="text-sm text-slate-400 hover:text-black underline">Clear Search</button>
              </div>
              {isSearchLoading ? (
                <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" /></div>
              ) : (
                <PostList posts={filteredSearchResults} section="blog" onDeletePost={handleDelete} isAdmin={isAdmin} />
              )}
            </section>
          ) : children}
        </main>

        <footer className="border-t border-slate-200 py-12 mt-auto bg-white">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <div className="font-serif font-bold text-lg mb-2">{SITE.name}</div>
              <div className="flex flex-col md:flex-row gap-4 text-xs text-slate-400 font-light">
                <p>© {new Date().getFullYear()} All rights reserved.</p>
                <div className="hidden md:flex gap-4 font-mono text-[10px] text-slate-500">
                  <span>Today: <b>{visitorStats.today}</b></span>
                  <span>Total: <b>{visitorStats.total}</b></span>
                </div>
                <div className="flex gap-4 justify-center">
                  <Link href="/about" className="hover:text-slate-600">About</Link>
                  <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
                </div>
              </div>
            </div>
            {isAdmin && (
              <button type="button" onClick={handleLogout} aria-label="관리자 로그아웃" className="text-slate-300 hover:text-slate-600 text-xs flex items-center gap-2">
                <LockOpenIcon className="w-3 h-3" /> Sign out
              </button>
            )}
          </div>
        </footer>

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSubmit={handleLogin}
        />
      </div>
    </AdminContext.Provider>
  );
}
