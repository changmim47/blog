import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabaseClient';
import { XMarkIcon } from './Icons';

interface BlogSuggestion {
  title: string;
  angle: string;
}

interface AnalysisResult {
  videoId: string;
  youtubeUrl: string;
  summary: string;
  keyTopics: string[];
  blogSuggestions: BlogSuggestion[];
}

interface VideoAnalysisModalProps {
  videoId: string;
  videoTitle: string;
  videoThumbnail?: string;
  onClose: () => void;
}

const VideoAnalysisModal: React.FC<VideoAnalysisModalProps> = ({
  videoId,
  videoTitle,
  videoThumbnail,
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [queuedTitles, setQueuedTitles] = useState<Set<string>>(new Set());
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setQueuedTitles(new Set());
    setElapsedSec(0);

    const startTime = Date.now();
    const timer = setInterval(() => {
      if (cancelled) return;
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    (async () => {
      try {
        console.log('[video-analyze] invoking for videoId:', videoId);
        const { data, error: fnError } = await supabase.functions.invoke('video-analyze', {
          body: { videoId },
        });
        if (cancelled) return;
        console.log('[video-analyze] response:', { fnError, data });
        if (fnError) throw new Error(fnError.message);
        const payload = data as AnalysisResult & { error?: string };
        if (payload.error) throw new Error(payload.error);
        setResult(payload);
      } catch (e) {
        if (cancelled) return;
        console.error('[video-analyze] failed:', e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [videoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleAddSuggestion = async (suggestion: BlogSuggestion) => {
    setQueueMessage(null);
    try {
      const { error: qErr } = await supabase
        .from('manual_seed_queue')
        .insert({
          keyword: suggestion.title,
          search_intent_hint: `[YouTube ${videoId}] ${suggestion.angle}`,
        });
      if (qErr) throw qErr;
      setQueuedTitles((prev) => new Set(prev).add(suggestion.title));
      setQueueMessage(`✅ "${suggestion.title}" 큐에 추가됨`);
    } catch (e) {
      setQueueMessage(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 모달을 body 직속에 렌더 — 부모의 transform/filter 등이 fixed 위치를 망가뜨리지 않도록
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-analysis-title"
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        <div className="flex gap-4 items-start mb-6 pr-8">
          {videoThumbnail && (
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img src={videoThumbnail} alt={videoTitle} className="w-32 h-20 object-cover rounded-lg" />
            </a>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-red-500 font-bold mb-1">Video Analysis</div>
            <h2 id="video-analysis-title" className="text-lg font-serif font-bold text-slate-900 line-clamp-2 leading-tight">
              {videoTitle}
            </h2>
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-red-500 border-r-red-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">🎬</span>
              </div>
            </div>
            <p className="text-base font-medium text-slate-900 mb-1">Gemini가 영상을 분석 중</p>
            <p className="text-xs text-slate-500 mb-3">시각 · 음성 · 자막을 모두 읽고 있어요</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
              <span className="font-mono tabular-nums">{elapsedSec}초 경과</span>
              <span className="text-slate-300">·</span>
              <span>보통 10~30초</span>
            </div>
            {elapsedSec > 45 && (
              <p className="text-[11px] text-amber-600 mt-4">긴 영상이면 60초+ 걸릴 수 있어요. 잠시만 더...</p>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <p className="font-medium mb-1">분석 실패</p>
            <p className="text-xs">{error}</p>
          </div>
        )}

        {result && !isLoading && !error && (
          <div className="space-y-6">
            {/* 요약 */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">핵심 요약</h3>
              <p className="text-sm text-slate-700 leading-relaxed font-light">{result.summary}</p>
            </section>

            {/* 키워드 */}
            {result.keyTopics.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">주요 키워드</h3>
                <div className="flex flex-wrap gap-2">
                  {result.keyTopics.map((t) => (
                    <span key={t} className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* 블로그 주제 제안 */}
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">추천 블로그 주제</h3>
                <span className="text-[10px] text-slate-400">클릭 → 다음 cron 큐에 추가</span>
              </div>
              <div className="flex flex-col gap-2">
                {result.blogSuggestions.map((s, i) => {
                  const queued = queuedTitles.has(s.title);
                  return (
                    <button
                      key={i}
                      onClick={() => !queued && handleAddSuggestion(s)}
                      disabled={queued}
                      className={`text-left p-4 rounded-lg border transition-colors ${
                        queued
                          ? 'border-emerald-300 bg-emerald-50 cursor-default'
                          : 'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/30'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-serif font-medium text-slate-900 mb-1 leading-tight">
                            {s.title}
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed">{s.angle}</p>
                        </div>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            queued ? 'text-emerald-600' : 'text-indigo-600'
                          }`}
                        >
                          {queued ? '✓ 큐 추가됨' : '+ 큐 추가'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {queueMessage && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                {queueMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default VideoAnalysisModal;
