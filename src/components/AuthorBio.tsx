import React from 'react';
import { Link } from 'react-router-dom';
import { AUTHOR } from '../constants/author';

const AuthorBio: React.FC = () => {
  // name 첫 글자를 이니셜로 (이미지 대신)
  const initial = AUTHOR.name.trim().charAt(0).toUpperCase();

  return (
    <div className="mt-16 pt-8 border-t border-slate-100">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center font-serif font-bold text-lg shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-serif font-bold text-slate-900 text-base leading-tight">
            {AUTHOR.name}
          </div>
          <div className="text-[11px] text-slate-400 uppercase tracking-widest mt-0.5 mb-2">
            {AUTHOR.alias}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed font-light">
            {AUTHOR.bio}
          </p>
          <Link
            to="/about"
            className="inline-block mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800 border-b border-transparent hover:border-indigo-600 transition-colors"
          >
            About →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthorBio;
