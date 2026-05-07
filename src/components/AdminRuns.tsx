import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GenerationRun } from '../types';
import { getGenerationRuns } from '../services/storage';

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const StatusBadge: React.FC<{ status: GenerationRun['status'] }> = ({ status }) => {
  const isSuccess = status === 'success';
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
        isSuccess
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-red-100 text-red-700'
      }`}
    >
      {isSuccess ? 'Success' : 'Failed'}
    </span>
  );
};

const AdminRuns: React.FC = () => {
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getGenerationRuns(50).then((data) => {
      if (cancelled) return;
      setRuns(data);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="animate-fade-in-up max-w-4xl mx-auto">
      <header className="mb-12 mt-8 text-center">
        <h2 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 tracking-tight">
          Generation Runs
        </h2>
        <div className="w-16 h-1 bg-indigo-500 mx-auto mb-6"></div>
        <p className="text-slate-500 text-lg font-light italic font-serif">
          Automated post generation history.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-serif italic">
          No runs yet. Run the generation script to see results here.
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-12">
          {runs.map((run) => {
            const isExpanded = expandedId === run.id;
            return (
              <div
                key={run.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              >
                <div className="p-5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <StatusBadge status={run.status} />
                      <span className="text-xs text-slate-400">
                        {formatDateTime(run.created_at)}
                      </span>
                    </div>

                    {run.keyword && (
                      <div className="mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2">
                          Keyword
                        </span>
                        <span className="text-sm text-slate-700">{run.keyword}</span>
                      </div>
                    )}

                    {run.topic && (
                      <div className="mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2">
                          Topic
                        </span>
                        <span className="text-sm text-slate-900 font-medium">{run.topic}</span>
                      </div>
                    )}

                    {run.error_message && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 font-mono whitespace-pre-wrap">
                        {run.error_message}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {run.post_id && (
                      <Link
                        to={`/p/${run.post_id}`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border-b border-transparent hover:border-indigo-600"
                      >
                        View Draft →
                      </Link>
                    )}
                    {run.trends_raw !== null && run.trends_raw !== undefined && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : run.id)}
                        className="text-xs text-slate-400 hover:text-slate-700"
                      >
                        {isExpanded ? 'Hide trends' : 'Show trends'}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && run.trends_raw !== null && (
                  <pre className="bg-slate-50 border-t border-slate-200 p-4 text-[11px] text-slate-600 overflow-x-auto font-mono">
                    {JSON.stringify(run.trends_raw, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminRuns;
