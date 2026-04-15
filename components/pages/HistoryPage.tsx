import React, { useState, useEffect } from 'react';
import { getHistory, deleteTranslation, clearHistory } from '../../services/historyService';
import type { TranslationRecord } from '../../types';
import { CloseIcon } from '../icons/CloseIcon';

export const HistoryPage: React.FC = () => {
  const [records, setRecords] = useState<TranslationRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setRecords(getHistory());
  }, []);

  const handleDelete = (id: string) => {
    deleteTranslation(id);
    setRecords(prev => prev.filter(r => r.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearHistory();
    setRecords([]);
    setConfirmClear(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-brand-800 mb-1">Translation History</h2>
          <p className="text-brand-400">{records.length} past translation{records.length !== 1 ? 's' : ''}</p>
        </div>
        {records.length > 0 && (
          <button
            onClick={handleClear}
            onBlur={() => setConfirmClear(false)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              confirmClear
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-brand-500 border border-brand-200 hover:bg-brand-100'
            }`}
          >
            {confirmClear ? 'Confirm clear all?' : 'Clear all'}
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-16 text-center">
          <div className="bg-brand-100 p-5 rounded-full inline-block mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-brand-800 mb-1">No translations yet</h3>
          <p className="text-brand-400 text-sm">
            Your translated patterns will appear here after you complete a translation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map(record => (
            <div key={record.id} className="bg-white rounded-2xl shadow-sm border border-brand-200 overflow-hidden">
              <div
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-brand-50/50 transition-colors"
                onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="bg-brand-100 p-2.5 rounded-xl shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-800 truncate">{record.fileName}</p>
                    <div className="flex items-center gap-3 text-xs text-brand-400 mt-0.5">
                      <span>{formatDate(record.timestamp)}</span>
                      <span className="bg-brand-100 text-brand-600 px-2 py-0.5 rounded font-medium">{record.targetLanguage}</span>
                      {record.pdfMetrics && <span>{record.pdfMetrics.pages} page{record.pdfMetrics.pages !== 1 ? 's' : ''}</span>}
                      {record.cost > 0 && <span>${record.cost.toFixed(2)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(record.id); }}
                    className="p-1.5 text-brand-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                  <svg
                    className={`w-5 h-5 text-brand-400 transition-transform ${expandedId === record.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>

              {expandedId === record.id && (
                <div className="border-t border-brand-200 p-5 bg-brand-50/30">
                  <div
                    className="bg-white rounded-xl border border-brand-200 p-6 max-h-96 overflow-y-auto text-sm text-brand-800 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: record.translatedHtml }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
