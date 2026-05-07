
import React from 'react';
import { CameraIcon, MusicIcon, BookIcon } from './Icons';

const About: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-20 animate-fade-in">
        <div className="flex flex-col md:flex-row gap-12 items-center mb-16">
            <div className="w-48 h-48 md:w-64 md:h-64 bg-slate-200 rounded-full overflow-hidden shrink-0 shadow-xl">
                <img 
                    // 👇 여기 따옴표("") 안에 복사한 주소를 넣으세요
                    src="https://gqhzlphlxoanqadthcgs.supabase.co/storage/v1/object/public/blogdb/images/image.jpg.jpg" 
                    alt="Profile" 
                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" 
                />
            </div>
            <div className="text-center md:text-left">
                <h1 className="text-4xl md:text-6xl font-serif font-bold text-slate-900 mb-6">안녕하세요. <br/><br/></h1>
                <p className="text-lg text-slate-600 leading-relaxed font-light mb-6">
                    제 블로그를 방문해 주셔서 감사합니다.<br/><br/>
                    이 블로그에 AI를 활용한 결과물을 게시할 예정입니다. 물론, Google AI Studio를 사용하여 블로그를 만들었습니다.
                    저는 AI 생태계를 공부하고 있는 비전공자이니 아무쪼록 잘 부탁드립니다.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed font-light">
                    Thank you for visiting my blog. This blog will show you the results of using AI.
                    Of course, I created this blog using Google AI Studio.
                    I'm a non-AI ecosystem major, so I hope you'll bear with me.
                </p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center">
                <div className="bg-indigo-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                    <CameraIcon className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl mb-2">Gallery</h3>
                <p className="text-slate-500 text-sm">Capturing the beauty of everyday life through my lens.</p>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center">
                <div className="bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600">
                    <MusicIcon className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl mb-2">Song</h3>
                <p className="text-slate-500 text-sm">Curating playlists that set the mood for every moment.</p>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm text-center">
                <div className="bg-emerald-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                    <BookIcon className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-xl mb-2">Stories</h3>
                <p className="text-slate-500 text-sm">Journaling thoughts, ideas, and reflections on life.</p>
            </div>
        </div>
    </div>
  );
};

export default About;
