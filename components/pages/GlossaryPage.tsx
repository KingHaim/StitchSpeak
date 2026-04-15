import React, { useState, useMemo } from 'react';
import { GLOSSARY_TERMS, GLOSSARY_LANGUAGES } from '../../data/glossary';
import { lookupTermWithAI, type AiTermResult } from '../../services/glossaryService';
import { SearchIcon } from '../icons/NavIcons';

export const GlossaryPage: React.FC = () => {
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('es');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'knitting' | 'crochet'>('knitting');

  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState<AiTermResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const sourceName = GLOSSARY_LANGUAGES.find(l => l.code === sourceLang)?.name ?? sourceLang;
  const targetName = GLOSSARY_LANGUAGES.find(l => l.code === targetLang)?.name ?? targetLang;

  const filtered = useMemo(() => {
    let terms = GLOSSARY_TERMS;

    if (activeTab === 'crochet') {
      terms = terms.filter(t => t.category === 'crochet');
    } else {
      terms = terms.filter(t => t.category !== 'crochet');
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      terms = terms.filter(t => {
        const src = t.terms[sourceLang];
        const tgt = t.terms[targetLang];
        if (!src && !tgt) return false;
        return (
          src?.abbreviation.toLowerCase().includes(q) ||
          src?.full.toLowerCase().includes(q) ||
          tgt?.abbreviation.toLowerCase().includes(q) ||
          tgt?.full.toLowerCase().includes(q)
        );
      });
    }
    return terms;
  }, [search, sourceLang, targetLang, activeTab]);

  const handleAiLookup = async () => {
    const q = aiQuery.trim() || search.trim();
    if (!q) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const result = await lookupTermWithAI(q, sourceName, targetName);
      setAiResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-brand-800 mb-1">Knitting & Crochet Glossary</h2>
        <p className="text-brand-400">Search {GLOSSARY_TERMS.length}+ terms across {GLOSSARY_LANGUAGES.length} languages</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-brand-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('knitting')}
          className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === 'knitting'
              ? 'bg-white text-brand-800 shadow-sm'
              : 'text-brand-500 hover:text-brand-700'
          }`}
        >
          Knitting
        </button>
        <button
          onClick={() => setActiveTab('crochet')}
          className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === 'crochet'
              ? 'bg-white text-brand-800 shadow-sm'
              : 'text-brand-500 hover:text-brand-700'
          }`}
        >
          Crochet
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-brand-200 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5">Source language</label>
            <select
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
              className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {GLOSSARY_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-2">
            <button
              onClick={() => { const tmp = sourceLang; setSourceLang(targetLang); setTargetLang(tmp); }}
              className="p-2 rounded-lg text-brand-400 hover:bg-brand-100 transition-colors"
              title="Swap languages"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </button>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5">Target language</label>
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {GLOSSARY_LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
          <input
            type="text"
            placeholder="Search terms, abbreviations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm text-brand-800 placeholder-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Term table */}
      <div className="bg-white rounded-2xl shadow-sm border border-brand-200 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 border-b border-brand-200">
                <th className="text-left px-4 py-3 font-semibold text-brand-600">Abbr ({sourceName})</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-600">Full term ({sourceName})</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-600">Abbr ({targetName})</th>
                <th className="text-left px-4 py-3 font-semibold text-brand-600">Full term ({targetName})</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-brand-400">
                    No terms found. Try the AI lookup below.
                  </td>
                </tr>
              ) : (
                filtered.map(term => {
                  const src = term.terms[sourceLang];
                  const tgt = term.terms[targetLang];
                  return (
                    <tr key={term.id} className="border-b border-brand-100 hover:bg-brand-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-brand-700 font-semibold">{src?.abbreviation || '—'}</td>
                      <td className="px-4 py-2.5 text-brand-800">{src?.full || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-brand-700 font-semibold">{tgt?.abbreviation || '—'}</td>
                      <td className="px-4 py-2.5 text-brand-800">{tgt?.full || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-brand-50 border-t border-brand-200 text-xs text-brand-400">
          Showing {filtered.length} of {GLOSSARY_TERMS.length} terms
        </div>
      </div>

      {/* AI Lookup */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-200">
        <h3 className="text-lg font-bold text-brand-800 mb-1">Can't find a term?</h3>
        <p className="text-sm text-brand-400 mb-4">Ask our AI to look it up for you.</p>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder={search.trim() || 'Enter a knitting term...'}
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAiLookup()}
            className="flex-1 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm text-brand-800 placeholder-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={handleAiLookup}
            disabled={aiLoading || (!aiQuery.trim() && !search.trim())}
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors disabled:bg-brand-200 disabled:cursor-not-allowed"
          >
            {aiLoading ? 'Looking up...' : 'Ask AI'}
          </button>
        </div>

        {aiError && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{aiError}</div>
        )}

        {aiResult && (
          <div className="mt-4 bg-brand-50 rounded-xl p-4 border border-brand-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-xs font-semibold text-brand-500 uppercase mb-1">{sourceName}</p>
                <p className="text-brand-800">
                  {aiResult.sourceAbbreviation && <span className="font-mono font-semibold text-brand-700">{aiResult.sourceAbbreviation} — </span>}
                  {aiResult.sourceFull}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-500 uppercase mb-1">{targetName}</p>
                <p className="text-brand-800">
                  {aiResult.targetAbbreviation && <span className="font-mono font-semibold text-brand-700">{aiResult.targetAbbreviation} — </span>}
                  {aiResult.targetFull}
                </p>
              </div>
            </div>
            {aiResult.explanation && (
              <p className="text-sm text-brand-500 italic border-t border-brand-200 pt-3">{aiResult.explanation}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
