import React, { useState, useEffect, useMemo } from 'react';
import { getHistory, getTranslationHtml, deleteTranslation, clearHistory } from '../../services/historyService';
import type { TranslationRecord } from '../../types';
import { CloseIcon } from '../icons/CloseIcon';

export const HistoryPage: React.FC = () => {
  const [records, setRecords] = useState<TranslationRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHtml, setExpandedHtml] = useState<string | null>(null);
  const [fullViewRecord, setFullViewRecord] = useState<TranslationRecord | null>(null);
  const [fullViewHtml, setFullViewHtml] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState<'all' | string>('all');

  useEffect(() => {
    setRecords(getHistory());
  }, []);

  const availableLanguages = useMemo(() => {
    return Array.from(new Set(records.map(record => record.targetLanguage))).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return records.filter((record) => {
      const matchesSearch = !query || [
        record.fileName,
        record.sourceLanguage,
        record.targetLanguage,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));

      const matchesLanguage = languageFilter === 'all' || record.targetLanguage === languageFilter;

      return matchesSearch && matchesLanguage;
    });
  }, [records, searchQuery, languageFilter]);

  const handleToggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedHtml(null);
    } else {
      setExpandedId(id);
      setExpandedHtml(getTranslationHtml(id));
    }
  };

  const handleOpenFullView = (record: TranslationRecord) => {
    setFullViewRecord(record);
    setFullViewHtml(getTranslationHtml(record.id));
  };

  const handleCloseFullView = () => {
    setFullViewRecord(null);
    setFullViewHtml(null);
  };

  const handleDelete = (id: string) => {
    deleteTranslation(id);
    setRecords(prev => prev.filter(r => r.id !== id));
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedHtml(null);
    }
    if (fullViewRecord?.id === id) {
      handleCloseFullView();
    }
  };

  const handleDownload = (record: TranslationRecord) => {
    const htmlContent = getTranslationHtml(record.id);
    if (!htmlContent) return;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${record.fileName} — ${record.targetLanguage}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#3D2B1F;line-height:1.7}h1,h2,h3{margin-top:1.5rem}p{margin-bottom:1rem}</style>
</head>
<body>${htmlContent}</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.fileName.replace(/\.[^.]+$/, '')}-${record.targetLanguage.toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearHistory();
    setRecords([]);
    setExpandedId(null);
    setExpandedHtml(null);
    handleCloseFullView();
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

  const hasActiveFilters = searchQuery.trim().length > 0 || languageFilter !== 'all';

  return (
    <>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-brand-800 mb-1">My Patterns</h2>
            <p className="text-brand-400">
              {filteredRecords.length} of {records.length} translated pattern{records.length !== 1 ? 's' : ''}
            </p>
          </div>
          {records.length > 0 && (
            <button
              onClick={handleClear}
              onBlur={() => setConfirmClear(false)}
              className={`px-4 py-3 text-sm font-medium rounded-lg transition-colors w-full md:w-auto ${
                confirmClear
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-brand-500 border border-brand-200 hover:bg-brand-100'
              }`}
            >
              {confirmClear ? 'Confirm clear all?' : 'Clear all'}
            </button>
          )}
        </div>

        {records.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-4 sm:p-5 mb-6">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
              <div className="flex-1">
                <label htmlFor="pattern-search" className="block text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5">
                  Search patterns
                </label>
                <input
                  id="pattern-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by file name or language"
                  className="w-full px-4 py-3 border border-brand-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors text-base"
                />
              </div>

              <div className="w-full lg:w-60">
                <label htmlFor="language-filter" className="block text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5">
                  Target language
                </label>
                <select
                  id="language-filter"
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="w-full px-4 py-3 border border-brand-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors text-base"
                >
                  <option value="all">All languages</option>
                  {availableLanguages.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setLanguageFilter('all');
                  }}
                  className="px-4 py-3 text-sm font-medium rounded-xl border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors w-full lg:w-auto"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {records.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-10 sm:p-16 text-center">
            <div className="bg-brand-100 p-5 rounded-full inline-block mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-brand-800 mb-1">No patterns yet</h3>
            <p className="text-brand-400 text-sm">
              Your translated patterns will show up here after you complete a translation.
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-brand-200 p-10 sm:p-12 text-center">
            <h3 className="text-lg font-bold text-brand-800 mb-1">No matching patterns</h3>
            <p className="text-brand-400 text-sm mb-4">
              Try a different file name or language filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setLanguageFilter('all');
              }}
              className="px-4 py-3 text-sm font-medium rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors w-full sm:w-auto"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecords.map(record => (
              <div key={record.id} className="bg-white rounded-2xl shadow-sm border border-brand-200 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => handleToggleExpand(record.id)}
                    aria-expanded={expandedId === record.id}
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="bg-brand-100 p-2.5 rounded-xl shrink-0 mt-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-brand-800 break-words">{record.fileName}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-brand-400 mt-1">
                              <span>{formatDate(record.timestamp)}</span>
                              <span className="bg-brand-100 text-brand-600 px-2 py-0.5 rounded font-medium">
                                {record.sourceLanguage && record.sourceLanguage !== 'Auto-Detect'
                                  ? `${record.sourceLanguage} → ${record.targetLanguage}`
                                  : record.targetLanguage}
                              </span>
                              {record.pdfMetrics && <span>{record.pdfMetrics.pages} page{record.pdfMetrics.pages !== 1 ? 's' : ''}</span>}
                              {record.cost > 0 && <span>${record.cost.toFixed(2)}</span>}
                            </div>
                          </div>
                          <svg
                            className={`w-5 h-5 text-brand-400 transition-transform shrink-0 mt-1 ${expandedId === record.id ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenFullView(record)}
                      className="px-3 py-2.5 text-sm font-medium text-brand-600 border border-brand-200 hover:bg-brand-100 rounded-lg transition-colors w-full sm:w-auto"
                    >
                      Open full view
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(record)}
                      className="px-3 py-2.5 text-sm font-medium text-brand-600 border border-brand-200 hover:bg-brand-100 rounded-lg transition-colors w-full sm:w-auto"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(record.id)}
                      className="px-3 py-2.5 text-sm font-medium text-red-500 border border-red-100 hover:bg-red-50 rounded-lg transition-colors w-full sm:w-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedId === record.id && (
                  <div className="border-t border-brand-200 p-4 sm:p-5 bg-brand-50/30">
                    {expandedHtml ? (
                      <div
                        className="pattern-rendered bg-white rounded-xl border border-brand-200 p-4 sm:p-6 max-h-96 overflow-y-auto text-sm text-brand-800 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: expandedHtml }}
                      />
                    ) : (
                      <p className="text-sm text-brand-400 italic">
                        Preview not available. Use the download button if you saved the file separately.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {fullViewRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleCloseFullView}></div>
          <div className="relative w-full max-w-5xl max-h-[94vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="bg-slate-50 p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-800 break-words">{fullViewRecord.fileName}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {fullViewRecord.sourceLanguage && fullViewRecord.sourceLanguage !== 'Auto-Detect'
                    ? `${fullViewRecord.sourceLanguage} → ${fullViewRecord.targetLanguage}`
                    : fullViewRecord.targetLanguage}
                  {' · '}
                  {formatDate(fullViewRecord.timestamp)}
                </p>
              </div>
              <button onClick={handleCloseFullView} className="text-slate-400 hover:text-slate-600 transition shrink-0" aria-label="Close full view">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-white">
              <button
                type="button"
                onClick={() => handleDownload(fullViewRecord)}
                className="w-full sm:w-auto px-4 py-3 text-sm font-medium rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
              >
                Download
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto bg-brand-50/20 flex-1">
              {fullViewHtml ? (
                <div
                  className="pattern-rendered bg-white rounded-xl border border-brand-200 p-4 sm:p-8 text-sm sm:text-base text-brand-800 leading-relaxed shadow-sm"
                  dangerouslySetInnerHTML={{ __html: fullViewHtml }}
                />
              ) : (
                <p className="text-sm text-brand-400 italic">
                  Full view is not available for this pattern. Try downloading it instead.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
