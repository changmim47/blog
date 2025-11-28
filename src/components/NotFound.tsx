
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from './Icons';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
      <div className="font-serif text-9xl font-bold text-slate-100 mb-4 select-none">
        404
      </div>
      
      <h1 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 mb-6 tracking-tight">
        Page Not Found
      </h1>
      
      <p className="text-lg text-slate-500 max-w-md mx-auto mb-10 leading-relaxed font-light">
        The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      </p>
      
      <Link 
        to="/" 
        className="group flex items-center bg-black text-white px-8 py-4 rounded-full hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
      >
        <span className="font-medium tracking-wide text-sm">Return Home</span>
        <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
      </Link>
    </div>
  );
};

export default NotFound;
