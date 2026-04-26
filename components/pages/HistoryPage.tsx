import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  loadHistory,
  loadTranslationHtml,
  loadPatternSource,
  deleteTranslation,
  clearHistory,
  PATTERNS_SYNCED_EVENT,
} from '../../services/historyService';
import {
  exportPatternPdf,
  exportPatternDoc,
  exportPatternHtml,
  exportPatternText,
} from '../../services/pdfExport';
import type { TranslationRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { CloseIcon } from '../icons/CloseIcon';
import { PatternViewer } from '../PatternViewer';
import { abbreviationLanguageCodeFromTargetLabel } from '../../services/abbreviationService';
import { setAddTranslationHint } from '../../services/addTranslationHint';

type DownloadFormat = 'pdf' | 'doc' | 'html' | 'txt';

const downloadOptions: { id: DownloadFormat; label: string; icon: string }[] = [
  { id: 'pdf', label: 'PDF', icon: 'picture_as_pdf' },
  { id: 'doc', label: 'Word (.docx)', icon: 'description' },
  { id: 'html', label: 'HTML', icon: 'code' },
  { id: 'txt', label: 'Text (.txt)', icon: 'article' },
];

const PLACEHOLDER_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCpgaNtjUhnSj5fWpj87xmX14PtoZKyHM7hb4baN2rDogUl65AO0ibafZ14ruclNXszrqk0cPDsCbAQq0jE2uTl7O0ugog66FNhf1kPoqLnYm9G0Dmgo_p15HugFXDveT8JMwFc2YxswiVWaSfBXg1eVcGZlylIZ6N73Kahrmf5dldNq_zWvJ08qcuJkbp9tfMrZT6HO1nRl6P9ZWWUdfDnvSVTVMKYyIz_3dHa0rWbju1HWc3Utons2RGNYkGyTUCf3odTrnnWErM',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBc1XcTX1NH1noyUs-CXlYFOGPQoB8-zLXACloiMpophzG7iU2hFGxGHCCrl5-UNrvNUC4NIFh-yxE8X8k4HbFNvkyT_z_1hBo4jJq_PaHq9hHi2lOuLm90sHTm8QH0uKCMA6GW4Q2zo7XlLdfGrL0-n_frRJNzMXfErQf1OPbMsqUO4qwx5kI0rIdAgocq-Hh_8LJanOI3KgnDxYZbB7_1QY9BMnGGFBm64B9ok9USAepNMoUli77GQ-VYPLggACUvNXOSutENALw',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAp8x6mkJk3z5RUuLaSMeAjbAKwvKaMZ-nkWyd7yUY1EiDFQJ3jCQPF72QAmumkHFSMibgT6ETApHcxoeOnJMC2yZSS8SRw_GPEaD7VCUIqVab9adIh4Vrj2PyZ9Kmoml5D7TXbu3qd3t6jSAz6XNGjJxsDi-IieoldJMsU00-CuOgUjpZXRjS4B2LSRCbau5M-qfT4CrA3SyxYkRMqy9J0b2-gW__Ggl1kH22W0uRgYBRisC1hDqBHl_1D8Hwb5kDorxgh6u4N3Tg',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCPVwqLvTsZs-KtIZWItODiMcwjwvM9h9FLVPpPgTLADVi5IQozJmmlCWdrKnMkNpijSDBCoELeDzXED6JP6U4iPrOlQeCKE5oQlbDdo-ZHNcf7TtXLxOWQIhQlpjq7cYiD0-rQilb4tf_rKlhJ4bdlNnVO_hMocuHpvU9SBgz7FS2r0XKjViTxY2WqoZ1-9Pjh8yYuIKqD686gVnrb9fzpeTuF3XGp4bYc2ejIcV-xHP4Em8ZwvbhEEmRgBYqZ8Za4zknhArYJjmU',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCkHtLFIfOMQAPJNey1MQuD47ZSqkdBh-UxMDGfYMd13j8x5buZm7nPAJO1z0QCyb0HC3z-OK9D0tNcF5Vk7P67htIZEX6mIWM9673x3A41GZemb6RpMFHj63oxZTYNLqGaQguRZyYaF7LWs8rXwsjcjRmnGyAIzUwr71JYSHVX86Yeb1LDPT_Bs08Gzz7FxhrKtEQSJvVhn6jolOPMW1bWxVaVbLnaBKsZPj2OB8qSQOxlxVTEk7JC1k3I-GlxEB4hQlrv6ZlSXqU',
];

function imageForRecord(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % 997;
  return PLACEHOLDER_IMAGES[h % PLACEHOLDER_IMAGES.length];
}

const Icon: React.FC<{ name: string; className?: string; filled?: boolean }> = ({
  name,
  className,
  filled,
}) => (
  <span
    className={`material-symbols-outlined ${className ?? ''}`}
    style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    aria-hidden
  >
    {name}
  </span>
);

export interface HistoryPageProps {
  onNavigateToTranslate?: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigateToTranslate }) => {
  const { idToken } = useAuth();

  const [records, setRecords] = useState<TranslationRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHtml, setExpandedHtml] = useState<string | null>(null);
  const [isExpandedLoading, setIsExpandedLoading] = useState(false);

  const [fullViewRecord, setFullViewRecord] = useState<TranslationRecord | null>(null);
  const [fullViewHtml, setFullViewHtml] = useState<string | null>(null);
  const [fullViewError, setFullViewError] = useState<string | null>(null);
  const [isFullViewLoading, setIsFullViewLoading] = useState(false);

  const [confirmClear, setConfirmClear] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState<'all' | string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDownloadMenuId, setActiveDownloadMenuId] = useState<string | null>(null);
  const [downloadingRecordId, setDownloadingRecordId] = useState<string | null>(null);
  const [addingTranslationId, setAddingTranslationId] = useState<string | null>(null);
  /**
   * Per-source-file selection: which translation is the "active" one inside a
   * grouped card. We keep this as a controlled override; when absent we fall
   * back to "the newest record in the group" or "the one matching the language
   * filter", whichever is more specific.
   */
  const [selectedByFile, setSelectedByFile] = useState<Record<string, string>>({});

  const downloadMenuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setIsLoadingRecords(true);
    setLoadError(null);
    setOfflineNotice(null);
    setActionError(null);
    try {
      const { records: list, offlineFallback } = await loadHistory(idToken);
      setRecords(list);
      if (offlineFallback) {
        setOfflineNotice(
          'Showing patterns stored only on this device. The server could not load your account library. For local development, run the API in the server folder and ensure VITE_API_URL points at it (or leave it unset so the dev proxy can reach port 3001).',
        );
      }
    } catch (err) {
      console.error('Failed to load patterns:', err);
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load your patterns. Please try again.',
      );
      setRecords([]);
    } finally {
      setIsLoadingRecords(false);
    }
  }, [idToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onSynced = () => {
      void refresh();
    };
    window.addEventListener(PATTERNS_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(PATTERNS_SYNCED_EVENT, onSynced);
  }, [refresh]);

  useEffect(() => {
    if (!activeDownloadMenuId) return;
    const handleClick = (event: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setActiveDownloadMenuId(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveDownloadMenuId(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [activeDownloadMenuId]);

  const availableLanguages = useMemo(() => {
    return Array.from(new Set(records.map(record => record.targetLanguage))).sort();
  }, [records]);

  /**
   * Records visible after the search box only — used for grouping. The
   * language filter is applied at the group level so a single matching
   * translation lights up the whole card and lets the user see the rest of
   * the languages on the same source file.
   */
  const searchedRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => {
      return [record.fileName, record.sourceLanguage, record.targetLanguage]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [records, searchQuery]);

  const handleToggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedHtml(null);
      return;
    }
    setExpandedId(id);
    setExpandedHtml(null);
    setIsExpandedLoading(true);
    try {
      const html = await loadTranslationHtml(id, idToken);
      setExpandedHtml(html);
    } catch (err) {
      console.error('Failed to load pattern preview:', err);
      setExpandedHtml(null);
    } finally {
      setIsExpandedLoading(false);
    }
  };

  const handleOpenFullView = async (record: TranslationRecord) => {
    setFullViewRecord(record);
    setFullViewHtml(null);
    setFullViewError(null);
    setIsFullViewLoading(true);
    try {
      const html = await loadTranslationHtml(record.id, idToken);
      setFullViewHtml(html);
      if (!html) {
        setFullViewError('No saved HTML was found for this pattern.');
      }
    } catch (err) {
      console.error('Failed to load pattern:', err);
      setFullViewHtml(null);
      setFullViewError(err instanceof Error ? err.message : 'Could not load this pattern.');
    } finally {
      setIsFullViewLoading(false);
    }
  };

  const handleCloseFullView = () => {
    setFullViewRecord(null);
    setFullViewHtml(null);
    setFullViewError(null);
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await deleteTranslation(id, idToken);
    } catch (err) {
      console.error('Failed to delete pattern:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Could not delete this pattern. Please try again.';
      setActionError(message);
      return;
    }
    setRecords(prev => prev.filter(r => r.id !== id));
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedHtml(null);
    }
    if (fullViewRecord?.id === id) {
      handleCloseFullView();
    }
  };

  const handleDownload = async (record: TranslationRecord, format: DownloadFormat) => {
    setActionError(null);
    setActiveDownloadMenuId(null);
    setDownloadingRecordId(record.id);
    let htmlContent = record.id === fullViewRecord?.id ? fullViewHtml : null;
    if (!htmlContent && record.id === expandedId) {
      htmlContent = expandedHtml;
    }
    if (!htmlContent) {
      try {
        htmlContent = await loadTranslationHtml(record.id, idToken);
      } catch (err) {
        console.error('Failed to load pattern for download:', err);
        setActionError(err instanceof Error ? err.message : 'Could not download this pattern.');
        setDownloadingRecordId(null);
        return;
      }
    }
    if (!htmlContent) {
      setDownloadingRecordId(null);
      return;
    }

    try {
      const exportOptions = {
        sourceFileName: record.fileName,
        languageCode: abbreviationLanguageCodeFromTargetLabel(record.targetLanguage),
      };
      switch (format) {
        case 'pdf':
          await exportPatternPdf(htmlContent, exportOptions);
          break;
        case 'doc':
          await exportPatternDoc(htmlContent, exportOptions);
          break;
        case 'html':
          exportPatternHtml(htmlContent, exportOptions);
          break;
        case 'txt':
          exportPatternText(htmlContent, exportOptions);
          break;
      }
    } catch (err) {
      console.error('Failed to export pattern:', err);
      setActionError(err instanceof Error ? err.message : 'Could not export this pattern.');
    } finally {
      setDownloadingRecordId(null);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setActionError(null);
    try {
      await clearHistory(idToken);
    } catch (err) {
      console.error('Failed to clear patterns:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Could not clear your patterns. Please try again.';
      setActionError(message);
      setConfirmClear(false);
      return;
    }
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

  const displayTitle = (fileName: string) => fileName.replace(/\.[^.]+$/, '');

  const langLine = (record: TranslationRecord) =>
    record.sourceLanguage && record.sourceLanguage !== 'Auto-Detect'
      ? `${record.sourceLanguage} → ${record.targetLanguage}`
      : record.targetLanguage;

  const hasActiveFilters = searchQuery.trim().length > 0 || languageFilter !== 'all';

  const goTranslate = () => onNavigateToTranslate?.();

  interface PatternGroup {
    fileName: string;
    records: TranslationRecord[];
    latestTimestamp: number;
  }

  /**
   * Group records by source file so each card on the same pattern can show
   * "already translated to French + Spanish" and seed the dashboard hint.
   */
  const recordsByFileName = useMemo(() => {
    const map = new Map<string, TranslationRecord[]>();
    for (const record of records) {
      const list = map.get(record.fileName) ?? [];
      list.push(record);
      map.set(record.fileName, list);
    }
    return map;
  }, [records]);

  /**
   * Groups visible after applying both the search box (per-record) and the
   * language filter (per-group). A group passes the filter as long as at least
   * one of its translations matches the active language. Each group's records
   * are sorted newest-first so the top chip / actions reflect the most recent
   * work on that pattern.
   */
  const groupedRecords = useMemo<PatternGroup[]>(() => {
    const map = new Map<string, TranslationRecord[]>();
    for (const record of searchedRecords) {
      const list = map.get(record.fileName) ?? [];
      list.push(record);
      map.set(record.fileName, list);
    }

    const groups: PatternGroup[] = [];
    for (const [fileName, list] of map.entries()) {
      const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp);
      const matchesLanguage =
        languageFilter === 'all' ||
        sorted.some((record) => record.targetLanguage === languageFilter);
      if (!matchesLanguage) continue;
      groups.push({
        fileName,
        records: sorted,
        latestTimestamp: sorted[0]?.timestamp ?? 0,
      });
    }
    groups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    return groups;
  }, [searchedRecords, languageFilter]);

  /** Total count of distinct source patterns currently visible. */
  const totalPatternsCount = recordsByFileName.size;

  /** Distinct source patterns per language (used for the filter pill counts). */
  const patternsPerLanguage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of recordsByFileName.values()) {
      const langs = new Set(list.map((r) => r.targetLanguage));
      for (const lang of langs) counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
    return counts;
  }, [recordsByFileName]);

  function activeRecordFor(group: PatternGroup): TranslationRecord {
    const overrideId = selectedByFile[group.fileName];
    if (overrideId) {
      const found = group.records.find((r) => r.id === overrideId);
      if (found) return found;
    }
    if (languageFilter !== 'all') {
      const matching = group.records.find((r) => r.targetLanguage === languageFilter);
      if (matching) return matching;
    }
    return group.records[0];
  }

  function setActiveRecord(fileName: string, recordId: string): void {
    setSelectedByFile((prev) => ({ ...prev, [fileName]: recordId }));
  }

  const handleAddTranslation = useCallback(
    async (record: TranslationRecord) => {
      const sameFileRecords = recordsByFileName.get(record.fileName) ?? [record];
      const existingLanguages = Array.from(
        new Set(sameFileRecords.map((r) => r.targetLanguage).filter(Boolean)),
      );

      const recordWithSource =
        sameFileRecords.find((r) => r.hasSource) ?? (record.hasSource ? record : null);

      setActionError(null);
      setAddingTranslationId(record.id);
      let sourceFile: File | null = null;

      if (recordWithSource) {
        try {
          sourceFile = await loadPatternSource(recordWithSource.id, idToken);
        } catch (err) {
          console.warn('[history] Could not pre-load source file:', err);
        }
      }

      setAddTranslationHint(
        {
          sourceFileName: record.fileName,
          existingLanguages,
          sourcePatternId: recordWithSource?.id,
          hasRemoteSource: !!recordWithSource,
        },
        sourceFile,
      );
      setAddingTranslationId(null);

      if (!sourceFile && recordWithSource) {
        setActionError(
          'We could not retrieve the original file from the server. You can still upload it again to add a new translation.',
        );
      }

      onNavigateToTranslate?.();
    },
    [recordsByFileName, onNavigateToTranslate, idToken],
  );

  const referencePatternFrame =
    viewMode === 'grid'
      ? 'aspect-[4/3]'
      : 'aspect-[4/3] md:aspect-auto md:w-56 md:min-h-[220px]';

  return (
    <>
      <div className="min-h-full bg-background text-on-background font-body selection:bg-primary-fixed selection:text-on-primary-fixed -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 sm:py-4 pb-36 sm:pb-40">
        <header className="mb-10 lg:mb-12 relative">
          {records.length > 0 && (
            <div className="flex justify-end mb-8">
              <button
                type="button"
                onClick={handleClear}
                onBlur={() => setConfirmClear(false)}
                className={`shrink-0 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                  confirmClear
                    ? 'bg-error text-on-error hover:opacity-95'
                    : 'border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {confirmClear ? 'Confirm clear all?' : 'Clear all'}
              </button>
            </div>
          )}

          <div className="relative w-full max-w-md mb-6">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-lg pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patterns…"
              className="w-full bg-surface-container-highest border-none rounded-lg pl-10 pr-4 py-2.5 sm:py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={() => setLanguageFilter('all')}
              className={`px-5 py-2 rounded-full text-sm font-semibold tracking-wide flex items-center gap-2 transition-all ${
                languageFilter === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              All patterns
              <span className={`px-2 rounded-full text-xs ${languageFilter === 'all' ? 'bg-on-primary/20' : 'bg-on-surface-variant/10'}`}>
                {totalPatternsCount}
              </span>
            </button>
            {availableLanguages.map((lang) => {
              const count = patternsPerLanguage.get(lang) ?? 0;
              const active = languageFilter === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(active ? 'all' : lang)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold tracking-wide flex items-center gap-2 transition-all ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  {lang}
                  <span className={`px-2 rounded-full text-xs ${active ? 'bg-on-primary/20' : 'bg-on-surface-variant/10'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setLanguageFilter('all');
                }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Reset filters
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid' ? 'bg-surface-container text-on-surface' : 'bg-transparent text-outline hover:bg-surface-container-high'
                }`}
                aria-label="Grid view"
              >
                <Icon name="grid_view" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list' ? 'bg-surface-container text-on-surface' : 'bg-transparent text-outline hover:bg-surface-container-high'
                }`}
                aria-label="List view"
              >
                <Icon name="list" />
              </button>
            </div>
          </div>
        </header>

        {loadError && (
          <div className="bg-error-container text-on-error-container rounded-xl p-5 mb-8 text-sm border border-error/20">
            <p className="font-semibold mb-1">Could not load your patterns</p>
            <p className="mb-3 opacity-90">{loadError}</p>
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-on-error-container/30 hover:bg-error/10 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {offlineNotice && !loadError && (
          <div
            className="bg-surface-container-high text-on-surface rounded-xl p-5 mb-8 text-sm border border-primary/25"
            role="status"
          >
            <p className="font-semibold mb-1 text-primary">Working from this browser only</p>
            <p className="text-on-surface-variant opacity-95 leading-relaxed">{offlineNotice}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 px-4 py-2 text-sm font-semibold rounded-lg border border-outline-variant/40 hover:bg-surface-container transition-colors"
            >
              Retry sync
            </button>
          </div>
        )}

        {actionError && (
          <div
            className="bg-error-container text-on-error-container rounded-xl p-4 mb-6 text-sm border border-error/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            role="alert"
          >
            <p className="font-medium">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="shrink-0 px-3 py-1.5 text-sm font-semibold rounded-lg border border-on-error-container/30 hover:bg-error/10 transition-colors self-start sm:self-auto"
            >
              Dismiss
            </button>
          </div>
        )}

        {isLoadingRecords ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-on-surface-variant">
            <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-medium">Loading your patterns…</span>
          </div>
        ) : records.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <article className="md:col-span-2 lg:col-span-3 relative bg-surface-container-low border-2 border-dashed border-outline-variant/30 rounded-xl overflow-hidden flex flex-col sm:flex-row items-center justify-center p-10 sm:p-12 text-center gap-6">
              <div className="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0">
                <Icon name="folder_open" className="text-4xl text-primary" />
              </div>
              <div className="max-w-md">
                <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">No patterns yet</h3>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                  Your translated patterns will show up here after you complete a translation.
                </p>
                <button
                  type="button"
                  onClick={goTranslate}
                  className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:shadow-lg transition-all active:scale-95"
                >
                  Start translating
                </button>
              </div>
            </article>
          </div>
        ) : groupedRecords.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl p-10 text-center border border-outline-variant/20">
            <h3 className="font-headline text-xl font-bold text-on-surface mb-2">No matching patterns</h3>
            <p className="text-on-surface-variant text-sm mb-6">Try a different search or language filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setLanguageFilter('all');
              }}
              className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-primary text-on-primary hover:opacity-90 transition-all"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
                : 'flex flex-col gap-4'
            }
          >
            {groupedRecords.map((group) => {
              const record = activeRecordFor(group);
              const isMultiTranslation = group.records.length > 1;
              return (
                <article
                  key={group.fileName}
                  className="group relative bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 flex flex-col h-full border border-outline-variant/10"
                >
                  <div
                    className={
                      viewMode === 'list'
                        ? 'flex flex-col md:flex-row md:items-stretch'
                        : 'flex flex-col flex-1'
                    }
                  >
                    <div
                      className={`overflow-hidden relative bg-surface-container shrink-0 ${referencePatternFrame}`}
                    >
                      <img
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        alt=""
                        src={imageForRecord(group.fileName)}
                      />
                      <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                        <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest flex items-center gap-1">
                          <Icon name="check_circle" className="text-xs" filled />
                          {isMultiTranslation ? `${group.records.length} languages` : 'Completed'}
                        </span>
                        <span className="bg-surface/80 glass-nav text-on-surface px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest">
                          {record.targetLanguage}
                        </span>
                      </div>
                    </div>
                    <div className="p-6 sm:p-8 flex flex-col flex-1 min-w-0">
                      <h3 className="font-headline text-xl sm:text-2xl font-bold mb-2 text-on-surface group-hover:text-primary transition-colors break-words">
                        {displayTitle(group.fileName)}
                      </h3>
                      <p className="text-on-surface-variant text-sm mb-3 leading-relaxed">
                        {langLine(record)}
                        {record.pdfMetrics ? ` · ${record.pdfMetrics.pages} page${record.pdfMetrics.pages !== 1 ? 's' : ''}` : ''}
                        {record.cost > 0 ? ` · $${record.cost.toFixed(2)}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mb-4">
                        {group.records.map((r) => {
                          const isActive = r.id === record.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setActiveRecord(group.fileName, r.id)}
                              className={`px-2.5 py-1 rounded-full text-[11px] uppercase font-semibold tracking-widest transition-colors ${
                                isActive
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                              }`}
                              title={`Switch to ${r.targetLanguage} translation`}
                            >
                              {r.targetLanguage}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => void handleAddTranslation(record)}
                          disabled={addingTranslationId === record.id}
                          className="px-2.5 py-1 rounded-full text-[11px] uppercase font-semibold tracking-widest border border-dashed border-primary/50 text-primary hover:bg-primary/10 transition-colors inline-flex items-center gap-1 disabled:opacity-60"
                          title="Translate this pattern into another language"
                        >
                          {addingTranslationId === record.id ? (
                            <svg
                              className="animate-spin h-3 w-3"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <Icon name="add" className="text-sm" />
                          )}
                          Add
                        </button>
                      </div>
                      <p className="text-on-surface-variant/90 text-xs mb-6">{formatDate(record.timestamp)}</p>
                      <div className="mt-auto pt-6 border-t border-outline-variant/10 flex flex-wrap items-center gap-2 sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenFullView(record)}
                            className="text-primary font-bold text-sm flex items-center gap-1 group/btn hover:underline"
                          >
                            View pattern
                            <Icon name="arrow_forward" className="text-lg group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                          <div ref={activeDownloadMenuId === record.id ? downloadMenuRef : undefined} className="relative">
                            <button
                              type="button"
                              onClick={() => setActiveDownloadMenuId((current) => (current === record.id ? null : record.id))}
                              disabled={downloadingRecordId === record.id}
                              aria-haspopup="menu"
                              aria-expanded={activeDownloadMenuId === record.id}
                              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-outline-variant/30 hover:bg-surface-container-high transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                            >
                              {downloadingRecordId === record.id ? 'Preparing…' : 'Download'}
                              {downloadingRecordId !== record.id && (
                                <Icon name="expand_more" className="text-base" />
                              )}
                            </button>
                            {activeDownloadMenuId === record.id && (
                              <div
                                role="menu"
                                className="absolute left-0 bottom-full mb-2 w-44 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden py-1 z-20 animate-in fade-in zoom-in duration-100 origin-bottom-left"
                              >
                                {downloadOptions.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void handleDownload(record, option.id)}
                                    className="w-full text-left px-3 py-2.5 hover:bg-surface-container-high transition-colors flex items-center gap-2 text-sm text-on-surface"
                                  >
                                    <Icon name={option.icon} className="text-lg text-primary" />
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleExpand(record.id)}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
                          >
                            {expandedId === record.id ? 'Hide preview' : 'Preview'}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(record.id)}
                          className="p-2 rounded-full text-error hover:bg-error-container/30 transition-colors ml-auto"
                          aria-label={`Delete ${record.targetLanguage} translation`}
                          title={
                            isMultiTranslation
                              ? `Delete the ${record.targetLanguage} translation`
                              : 'Delete this pattern'
                          }
                        >
                          <Icon name="delete" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {expandedId === record.id && (
                    <div
                      className={`border-t border-outline-variant/10 p-4 sm:p-6 bg-surface-container-low w-full ${
                        viewMode === 'list' ? 'flex justify-start' : ''
                      }`}
                    >
                      {isExpandedLoading ? (
                        <div
                          className={`flex items-center justify-center bg-surface-container-lowest rounded-xl border border-outline-variant/20 min-h-0 overflow-hidden ${referencePatternFrame} w-full shrink-0`}
                        >
                          <p className="text-sm text-on-surface-variant italic px-4">Loading preview…</p>
                        </div>
                      ) : expandedHtml ? (
                        <div
                          className={`bg-surface-container-lowest rounded-xl border border-outline-variant/20 flex flex-col min-h-0 overflow-hidden ${referencePatternFrame} w-full shrink-0`}
                        >
                          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 text-sm text-on-surface leading-relaxed [scrollbar-gutter:stable]">
                            <PatternViewer
                              html={expandedHtml}
                              languageCode={abbreviationLanguageCodeFromTargetLabel(record.targetLanguage)}
                              tone="studio"
                            />
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`flex items-center justify-center bg-surface-container-lowest rounded-xl border border-outline-variant/20 min-h-0 overflow-hidden ${referencePatternFrame} w-full shrink-0`}
                        >
                          <p className="text-sm text-on-surface-variant italic px-4 text-center">
                            Preview not available. Try downloading the file.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            <article className="group relative bg-surface-container-low border-2 border-dashed border-outline-variant/30 rounded-xl overflow-hidden flex flex-col items-center justify-center p-10 sm:p-12 text-center min-h-[320px] hover:bg-surface-container-high transition-colors">
              <div className="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Icon name="auto_fix_high" className="text-4xl text-primary" />
              </div>
              <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">Translate new pattern</h3>
              <p className="text-on-surface-variant text-sm max-w-xs mb-8 leading-relaxed">
                Upload a PDF and get a clean, translated pattern with layout preserved.
              </p>
              <button
                type="button"
                onClick={goTranslate}
                className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:shadow-lg transition-all active:scale-95"
              >
                Start translating
              </button>
            </article>
          </div>
        )}
      </div>

      {fullViewRecord &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <button
              type="button"
              className="absolute inset-0 z-[100] bg-inverse-surface/60 backdrop-blur-sm cursor-default border-0 p-0"
              onClick={handleCloseFullView}
              aria-label="Close overlay"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="full-view-pattern-title"
              className="relative z-[110] w-full max-w-5xl max-h-[94vh] bg-surface rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-outline-variant/20 animate-in fade-in zoom-in duration-200"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="bg-surface-container-high p-4 sm:p-5 border-b border-outline-variant/15 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 id="full-view-pattern-title" className="text-lg font-bold text-on-surface break-words font-headline">
                    {displayTitle(fullViewRecord.fileName)}
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    {langLine(fullViewRecord)}
                    {' · '}
                    {formatDate(fullViewRecord.timestamp)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseFullView}
                  className="text-on-surface-variant hover:text-on-surface transition shrink-0"
                  aria-label="Close full view"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/15 bg-surface-container-lowest">
                <div ref={activeDownloadMenuId === fullViewRecord.id ? downloadMenuRef : undefined} className="relative w-full sm:w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveDownloadMenuId((current) => (current === fullViewRecord.id ? null : fullViewRecord.id))}
                    disabled={downloadingRecordId === fullViewRecord.id}
                    aria-haspopup="menu"
                    aria-expanded={activeDownloadMenuId === fullViewRecord.id}
                    className="w-full sm:w-auto px-4 py-3 text-sm font-semibold rounded-xl border border-outline-variant/30 text-primary hover:bg-surface-container-high transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                  >
                    {downloadingRecordId === fullViewRecord.id ? 'Preparing…' : 'Download'}
                    {downloadingRecordId !== fullViewRecord.id && (
                      <Icon name="expand_more" className="text-base" />
                    )}
                  </button>
                  {activeDownloadMenuId === fullViewRecord.id && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full mt-2 w-48 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-xl overflow-hidden py-1 z-20 animate-in fade-in zoom-in duration-100 origin-top-left"
                    >
                      {downloadOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="menuitem"
                          onClick={() => void handleDownload(fullViewRecord, option.id)}
                          className="w-full text-left px-3 py-2.5 hover:bg-surface-container-high transition-colors flex items-center gap-2 text-sm text-on-surface"
                        >
                          <Icon name={option.icon} className="text-lg text-primary" />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto bg-background flex-1">
                {isFullViewLoading ? (
                  <p className="text-sm text-on-surface-variant italic">Loading pattern…</p>
                ) : fullViewHtml ? (
                  <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-4 sm:p-8 text-sm sm:text-base text-on-surface leading-relaxed shadow-sm min-h-[12rem]">
                    <PatternViewer
                      html={fullViewHtml}
                      languageCode={abbreviationLanguageCodeFromTargetLabel(fullViewRecord.targetLanguage)}
                      tone="studio"
                    />
                  </div>
                ) : fullViewError ? (
                  <div className="rounded-xl border border-error/30 bg-error-container/30 p-4 text-sm text-on-error-container space-y-3">
                    <p className="font-medium">{fullViewError}</p>
                    <button
                      type="button"
                      onClick={() => void handleOpenFullView(fullViewRecord)}
                      className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant italic">
                    Full view is not available for this pattern. Try downloading it instead.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
