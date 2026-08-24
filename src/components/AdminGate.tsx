'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIsAdmin } from './AdminContext';

export default function AdminGate({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();
  if (isAdmin) return children;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-3xl font-serif font-bold text-slate-800 mb-4">Access Denied</h1>
      <p className="text-slate-500 mb-8">관리자 로그인이 필요한 페이지입니다.</p>
      <Link href="/login" className="bg-black text-white px-6 py-3 rounded-full hover:bg-slate-800">
        Sign In
      </Link>
    </div>
  );
}
