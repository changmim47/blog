import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface VideoData {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  url: string;
}

interface KeywordData {
  keyword: string;
  count: number;
  videoIds: string[];
}

interface AnalysisResult {
  query: string;
  videos: VideoData[];
  keywords: KeywordData[];
  videoCount: number;
}

const AdminYoutube: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSearchId, setSavedSearchId] = useState<number | null>(null);
  const [queuedKeywords, setQueuedKeywords] = useState<Set<string>>(new Set());
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const q = query.trim();
    if (!q) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setSavedSearchId(null);
    setQueuedKeywords(new Set());
    setQueueMessage(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('youtube-analyze', {
        body: { keyword: q },
      });
      if (fnError) throw new Error(fnError.message);
      const payload = data as AnalysisResult & { error?: string };
      if (payload.error) throw new Error(payload.error);
      setResult(payload);

      // 검색 기록 저장
      const { data: saved } = await supabase
        .from('youtube_searches')
        .insert({
          query: payload.query,
          videos: payload.videos,
          keywords: payload.keywords,
          video_count: payload.videoCount,
        })
        .select('id')
        .single();
      if (saved) setSavedSearchId(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddToQueue = async (keyword: string) => {
    setQueueMessage(null);
    try {
      const { error: qErr } = await supabase
        .from('manual_seed_queue')
        .insert({ keyword, search_intent_hint: result?.query });
      if (qErr) throw qErr;
      setQueuedKeywords((prev) => new Set(prev).add(keyword));
      setQueueMessage(`✅ "${keyword}" 큐에 추가됨 — 다음 cron 실행 시 사용됩니다.`);
    } catch (e) {
      setQueueMessage(`❌ 추가 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCsvDownload = () => {
    if (!result) return;
    const rows = [
      ['Title', 'Channel', 'Views', 'Likes', 'Comments', 'Published', 'URL', 'Tags'],
      ...result.videos.map((v) => [
        v.title,
        v.channelTitle,
        v.viewCount,
        v.likeCount,
        v.commentCount,
        v.publishedAt.split('T')[0],
        v.url,
        v.tags.join('; '),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-${result.query.replace(/\s+/g, '_')}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleKeywordsCsv = () => {
    if (!result) return;
    const rows = [
      ['Keyword', 'Frequency', 'VideoCount'],
      ...result.keywords.map((k) => [k.keyword, k.count, k.videoIds.length]),
    ];
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keywords-${result.query.replace(/\s+/g, '_')}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in-up max-w-6xl mx-auto">
      <header className="mb-12 mt-8 text-center">
        <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">
          YouTube Trends
        </h2>
        <div className="w-16 h-1 bg-red-500 mx-auto mb-6"></div>
        <p className="text-slate-500 text-lg font-light italic font-serif">
          키워드 분석으로 블로그 주제 발굴
        </p>
      </header>

      {/* 검색 폼 */}
      <div className="mb-8 max-w-2xl mx-auto">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isAnalyzing) handleAnalyze();
            }}
            placeholder="예: 2026 주식 종목 추천, AI 자동매매, ChatGPT 사용법..."
            className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            disabled={isAnalyzing}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !query.trim()}
            className="bg-black text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-gray-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? '분석 중...' : '분석'}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {isAnalyzing && (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-red-600 rounded-full animate-spin"></div>
        </div>
      )}

      {result && (
        <>
          <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
            <div>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">"{result.query}"</span> · 영상{' '}
                {result.videoCount}개 · 키워드 {result.keywords.length}개 추출
                {savedSearchId && (
                  <span className="text-xs text-emerald-600 ml-2">✓ 히스토리 저장됨</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleKeywordsCsv}
                className="text-xs font-medium px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                📊 키워드 CSV
              </button>
              <button
                onClick={handleCsvDownload}
                className="text-xs font-medium px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                📊 영상 CSV
              </button>
            </div>
          </div>

          {queueMessage && (
            <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              {queueMessage}
            </div>
          )}

          {/* 키워드 섹션 */}
          <section className="mb-12">
            <h3 className="text-xl font-serif font-medium text-slate-900 mb-1">공통 키워드</h3>
            <p className="text-xs text-slate-400 mb-4">
              💡 키워드 클릭 → 다음 cron 실행 시 그 키워드로 블로그 글 자동 생성
            </p>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              {result.keywords.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  추출된 공통 키워드가 없습니다 (최소 2개 영상에 등장하는 단어만 표시).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {result.keywords.map((k) => {
                    const queued = queuedKeywords.has(k.keyword);
                    return (
                      <button
                        key={k.keyword}
                        onClick={() => !queued && handleAddToQueue(k.keyword)}
                        disabled={queued}
                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-colors ${
                          queued
                            ? 'bg-emerald-100 text-emerald-700 cursor-default'
                            : 'bg-slate-100 hover:bg-indigo-100'
                        }`}
                        title={
                          queued
                            ? '큐에 추가됨'
                            : `${k.count}개 영상에 등장 — 클릭하면 블로그 큐에 추가`
                        }
                      >
                        <span className="font-medium text-slate-900">{k.keyword}</span>
                        <span
                          className={
                            queued ? 'text-emerald-600' : 'text-slate-400 group-hover:text-indigo-600'
                          }
                        >
                          {queued ? '✓' : `×${k.count}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* 영상 섹션 */}
          <section className="pb-12">
            <h3 className="text-xl font-serif font-medium text-slate-900 mb-4">인기 영상</h3>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3 w-32"></th>
                      <th className="px-4 py-3">제목 / 채널</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">조회수</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">좋아요</th>
                      <th className="px-4 py-3 whitespace-nowrap">게시일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.videos.map((v) => (
                      <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <a href={v.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={v.thumbnail}
                              alt={v.title}
                              loading="lazy"
                              className="w-28 h-16 object-cover rounded"
                            />
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-slate-900 hover:text-indigo-600 line-clamp-2 leading-tight"
                          >
                            {v.title}
                          </a>
                          <div className="text-xs text-slate-500 mt-1">{v.channelTitle}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap">
                          {v.viewCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-500 whitespace-nowrap">
                          {v.likeCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(v.publishedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default AdminYoutube;
