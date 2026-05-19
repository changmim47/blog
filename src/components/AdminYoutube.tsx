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
  mode: 'search' | 'trending';
  query: string;
  videos: VideoData[];
  keywords: KeywordData[];
  videoCount: number;
  publishedAfter?: string | null;
  videoCategoryId?: string | null;
}

type Period = 'all' | '1y' | '6m' | '3m' | '1m' | '1w';
type Mode = 'search' | 'trending';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '1w', label: '최근 1주' },
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '6m', label: '최근 6개월' },
  { value: '1y', label: '최근 1년' },
  { value: 'all', label: '전체 기간' },
];

// YouTube Data API video category IDs (KR에서 자주 보는 것 위주)
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: '10', label: '음악' },
  { value: '20', label: '게임' },
  { value: '24', label: '엔터테인먼트' },
  { value: '23', label: '코미디' },
  { value: '25', label: '뉴스/정치' },
  { value: '26', label: '하우투/스타일' },
  { value: '27', label: '교육' },
  { value: '28', label: '과학/기술' },
  { value: '17', label: '스포츠' },
  { value: '22', label: 'People & Blogs' },
  { value: '1', label: '영화/애니메이션' },
];

const periodToPublishedAfter = (p: Period): string | undefined => {
  if (p === 'all') return undefined;
  const d = new Date();
  switch (p) {
    case '1w': d.setDate(d.getDate() - 7); break;
    case '1m': d.setMonth(d.getMonth() - 1); break;
    case '3m': d.setMonth(d.getMonth() - 3); break;
    case '6m': d.setMonth(d.getMonth() - 6); break;
    case '1y': d.setFullYear(d.getFullYear() - 1); break;
  }
  return d.toISOString();
};

const AdminYoutube: React.FC = () => {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('3m');
  const [category, setCategory] = useState<string>('all');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSearchId, setSavedSearchId] = useState<number | null>(null);
  const [queuedKeywords, setQueuedKeywords] = useState<Set<string>>(new Set());
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (mode === 'search' && !query.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setSavedSearchId(null);
    setQueuedKeywords(new Set());
    setQueueMessage(null);

    try {
      const body =
        mode === 'search'
          ? { mode: 'search', keyword: query.trim(), publishedAfter: periodToPublishedAfter(period) }
          : { mode: 'trending', videoCategoryId: category === 'all' ? undefined : category };
      const { data, error: fnError } = await supabase.functions.invoke('youtube-analyze', { body });
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

      {/* 탭 */}
      <div className="mb-6 max-w-2xl mx-auto flex border-b border-slate-200">
        <button
          onClick={() => { setMode('search'); setResult(null); setError(null); }}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
            mode === 'search'
              ? 'border-black text-black'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          🔍 키워드 분석
        </button>
        <button
          onClick={() => { setMode('trending'); setResult(null); setError(null); }}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
            mode === 'trending'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          🔥 인기 급상승
        </button>
      </div>

      {/* 입력 폼 - 모드별 */}
      <div className="mb-8 max-w-2xl mx-auto">
        {mode === 'search' ? (
          <>
            <div className="flex gap-2 mb-2">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                disabled={isAnalyzing}
                className="px-3 py-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isAnalyzing) handleAnalyze(); }}
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
            <p className="text-[11px] text-slate-400 ml-1">
              기본 "최근 3개월" — 트렌드 신선도 vs 데이터 양 균형
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isAnalyzing}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="bg-red-600 text-white px-6 py-3 rounded-lg text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? '분석 중...' : '인기 차트 가져오기'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 ml-1">
              YouTube 공식 인기 급상승 차트 (KR 기준, 실시간). 카테고리 필터 가능.
            </p>
          </>
        )}
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
                {result.mode === 'trending' ? (
                  <span className="font-semibold text-slate-900">🔥 {result.query}</span>
                ) : (
                  <span className="font-semibold text-slate-900">"{result.query}"</span>
                )}
                <span> · 영상 {result.videoCount}개 · 키워드 {result.keywords.length}개 추출</span>
                {savedSearchId && (
                  <span className="text-xs text-emerald-600 ml-2">✓ 히스토리 저장됨</span>
                )}
              </p>
              {result.publishedAfter && (
                <p className="text-xs text-slate-400 mt-1">
                  📅 {new Date(result.publishedAfter).toLocaleDateString()} 이후 발행된 영상만
                </p>
              )}
              {result.mode === 'trending' && (
                <p className="text-xs text-slate-400 mt-1">
                  📊 YouTube 공식 인기 급상승 차트 (KR) — 실시간 스냅샷
                </p>
              )}
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
