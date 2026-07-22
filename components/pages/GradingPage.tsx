import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/auth-context';
import { useCredits } from '../../contexts/credit-context';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { SelectDropdown } from '../SelectDropdown';
import {
  checkGradingAccess,
  extractGradingFromPattern,
  proposeGrading,
  GradingError,
  type ProposeGradingResult,
} from '../../services/gradingService';
import { loadHistory } from '../../services/historyService';
import { estimateGradingExtractCost } from '../../services/pricingService';
import { PRICING } from '../../constants';
import type {
  CreditPackage,
  GradingConstruction,
  GradingMeasurementKind,
  GradingRequestInput,
  GradingUnit,
  TranslationRecord,
} from '../../types';

interface MeasurementForm {
  id: string;
  name: string;
  kind: GradingMeasurementKind;
  /** Per-size values as raw input strings; '' = not graded for that size. */
  values: string[];
}

interface ShapingForm {
  id: string;
  name: string;
  fromId: string;
  toId: string;
  overId: string;
  stitchesPerEvent: string;
}

let idCounter = 0;
const nextId = (prefix: string): string => `${prefix}-${++idCounter}`;

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

function defaultMeasurements(): MeasurementForm[] {
  return [
    {
      id: nextId('m'),
      name: 'Bust circumference',
      kind: 'circumference',
      values: DEFAULT_SIZES.map(() => ''),
    },
    {
      id: nextId('m'),
      name: 'Hem to underarm',
      kind: 'length',
      values: DEFAULT_SIZES.map(() => ''),
    },
  ];
}

const inputClass =
  'w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40';
const labelClass = 'block text-xs font-medium text-on-surface-variant mb-1 normal-case tracking-normal';

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export const GradingPage: React.FC = () => {
  const { idToken, isAuthenticated } = useAuth();
  const { applyBalance, refreshBalance, startCheckout } = useCredits();

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [savedPatterns, setSavedPatterns] = useState<TranslationRecord[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionNotes, setExtractionNotes] = useState<string[]>([]);
  const [extractedTitle, setExtractedTitle] = useState<string | null>(null);
  const [isBuyCreditsOpen, setIsBuyCreditsOpen] = useState(false);
  const [units, setUnits] = useState<GradingUnit>('cm');
  const [construction, setConstruction] = useState<GradingConstruction>('flat');
  const [measurementsAre, setMeasurementsAre] = useState<'body' | 'finished'>('finished');
  const [gaugeSts, setGaugeSts] = useState('20');
  const [gaugeRows, setGaugeRows] = useState('28');
  const [gaugeWidth, setGaugeWidth] = useState('10');
  const [gaugeHeight, setGaugeHeight] = useState('10');
  const [stitchRepeat, setStitchRepeat] = useState('1');
  const [edgeStitches, setEdgeStitches] = useState('0');
  const [ease, setEase] = useState('0');
  const [sizeNames, setSizeNames] = useState<string[]>(DEFAULT_SIZES);
  const [baseSizeIndex, setBaseSizeIndex] = useState(2);
  const [measurements, setMeasurements] = useState<MeasurementForm[]>(defaultMeasurements);
  const [shaping, setShaping] = useState<ShapingForm[]>([]);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProposeGradingResult | null>(null);
  const [approvedSizes, setApprovedSizes] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    checkGradingAccess(idToken)
      .then(setHasAccess)
      .catch((err) => console.error('[grading] access check failed:', err));
    loadHistory(idToken)
      .then(({ records }) => setSavedPatterns(records.filter((r) => r.hasSource)))
      .catch((err) => console.error('[grading] failed to load saved patterns:', err));
  }, [idToken, isAuthenticated]);

  const selectedPattern = savedPatterns.find((r) => r.id === selectedPatternId) ?? null;
  const extractCost = selectedPattern?.pdfMetrics
    ? estimateGradingExtractCost(selectedPattern.pdfMetrics)
    : null;
  const extractTooManyPages = selectedPattern?.pdfMetrics
    ? selectedPattern.pdfMetrics.pages > PRICING.gradingExtract.maxPages
    : false;

  /** Fill the whole form from a pattern extraction; designer reviews before proposing. */
  const applyExtraction = (input: GradingRequestInput) => {
    setUnits(input.units);
    setConstruction(input.construction);
    setMeasurementsAre(input.measurementsAre);
    setGaugeSts(String(input.gauge.stitches));
    setGaugeRows(String(input.gauge.rows));
    setGaugeWidth(String(input.gauge.widthCm));
    setGaugeHeight(String(input.gauge.heightCm));
    setStitchRepeat(String(input.stitchRepeat));
    setEdgeStitches(String(input.edgeStitches));
    setEase(String(input.ease));
    setSizeNames(input.sizeNames);
    setBaseSizeIndex(Math.min(input.baseSizeIndex, input.sizeNames.length - 1));
    setMeasurements(
      input.measurements.map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        values: m.values.map((v) => (v === null ? '' : String(v))),
      })),
    );
    setShaping(
      input.shaping.map((s) => ({
        id: s.id,
        name: s.name,
        fromId: s.fromId,
        toId: s.toId,
        overId: s.overId,
        stitchesPerEvent: String(s.stitchesPerEvent),
      })),
    );
    setResult(null);
    setApprovedSizes(new Set());
    setCopied(false);
  };

  const handleExtract = useCallback(async () => {
    if (!selectedPatternId || isExtracting) return;
    setError(null);
    setExtractionNotes([]);
    setExtractedTitle(null);
    setIsExtracting(true);
    try {
      const { extraction, balance } = await extractGradingFromPattern(selectedPatternId, idToken);
      if (typeof balance === 'number') applyBalance(balance);
      applyExtraction(extraction.input);
      setExtractionNotes(extraction.notes);
      setExtractedTitle(extraction.patternTitle);
    } catch (err) {
      console.error('[grading] extraction failed:', err);
      void refreshBalance();
      if (err instanceof GradingError && err.status === 402) {
        setIsBuyCreditsOpen(true);
        setError("You don't have enough credits for this extraction. Add credits and try again.");
      } else if (err instanceof GradingError && err.code === 'BETA_REQUIRED') {
        setHasAccess(false);
      } else {
        setError(err instanceof Error ? err.message : 'The extraction failed. Please try again.');
      }
    } finally {
      setIsExtracting(false);
    }
  }, [selectedPatternId, isExtracting, idToken, applyBalance, refreshBalance]);

  const handleCreditPurchase = useCallback(
    async (pack: CreditPackage) => {
      await startCheckout(pack.id);
    },
    [startCheckout],
  );

  const widthMeasurements = useMemo(
    () => measurements.filter((m) => m.kind !== 'length'),
    [measurements],
  );
  const lengthMeasurements = useMemo(
    () => measurements.filter((m) => m.kind === 'length'),
    [measurements],
  );

  // --- Size columns ---

  const addSize = () => {
    setSizeNames((prev) => [...prev, `Size ${prev.length + 1}`]);
    setMeasurements((prev) => prev.map((m) => ({ ...m, values: [...m.values, ''] })));
  };

  const removeSize = (index: number) => {
    if (sizeNames.length <= 1) return;
    setSizeNames((prev) => prev.filter((_, i) => i !== index));
    setMeasurements((prev) => prev.map((m) => ({ ...m, values: m.values.filter((_, i) => i !== index) })));
    setBaseSizeIndex((prev) => (prev >= index && prev > 0 ? prev - 1 : prev));
  };

  const renameSize = (index: number, name: string) => {
    setSizeNames((prev) => prev.map((s, i) => (i === index ? name : s)));
  };

  // --- Measurement rows ---

  const addMeasurement = (kind: GradingMeasurementKind) => {
    setMeasurements((prev) => [
      ...prev,
      {
        id: nextId('m'),
        name: kind === 'length' ? 'New length' : 'New width',
        kind,
        values: sizeNames.map(() => ''),
      },
    ]);
  };

  const updateMeasurement = (id: string, patch: Partial<MeasurementForm>) => {
    setMeasurements((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const setMeasurementValue = (id: string, sizeIndex: number, value: string) => {
    setMeasurements((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, values: m.values.map((v, i) => (i === sizeIndex ? value : v)) } : m,
      ),
    );
  };

  const removeMeasurement = (id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
    setShaping((prev) => prev.filter((s) => s.fromId !== id && s.toId !== id && s.overId !== id));
  };

  // --- Shaping segments ---

  const addShaping = () => {
    const widths = widthMeasurements;
    const lengths = lengthMeasurements;
    if (widths.length === 0 || lengths.length === 0) return;
    setShaping((prev) => [
      ...prev,
      {
        id: nextId('s'),
        name: `Shaping ${prev.length + 1}`,
        fromId: widths[0].id,
        toId: widths[widths.length - 1].id,
        overId: lengths[0].id,
        stitchesPerEvent: '2',
      },
    ]);
  };

  const updateShaping = (id: string, patch: Partial<ShapingForm>) => {
    setShaping((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeShaping = (id: string) => {
    setShaping((prev) => prev.filter((s) => s.id !== id));
  };

  // --- Submit ---

  const buildRequest = (): GradingRequestInput | string => {
    const gauge = {
      stitches: parseNumber(gaugeSts),
      rows: parseNumber(gaugeRows),
      widthCm: parseNumber(gaugeWidth),
      heightCm: parseNumber(gaugeHeight),
    };
    if (!gauge.stitches || !gauge.rows || !gauge.widthCm || !gauge.heightCm) {
      return 'Fill in the full gauge (stitches, rows and the swatch dimensions).';
    }
    const repeat = parseNumber(stitchRepeat);
    if (repeat === null || repeat < 1 || !Number.isInteger(repeat)) {
      return 'Stitch repeat must be a whole number of at least 1.';
    }
    const edges = parseNumber(edgeStitches) ?? 0;
    if (edges < 0 || !Number.isInteger(edges)) return 'Edge stitches must be a whole number.';
    const easeValue = parseNumber(ease) ?? 0;

    const names = sizeNames.map((s) => s.trim()).filter(Boolean);
    if (names.length !== sizeNames.length || names.length === 0) return 'Every size needs a name.';

    const parsedMeasurements = measurements.map((m) => ({
      id: m.id,
      name: m.name.trim() || 'Measurement',
      kind: m.kind,
      values: m.values.map((v) => parseNumber(v)),
    }));
    if (!parsedMeasurements.some((m) => m.values.some((v) => v !== null))) {
      return 'Enter at least one measurement value.';
    }

    const parsedShaping = [];
    for (const s of shaping) {
      const perEvent = parseNumber(s.stitchesPerEvent);
      if (perEvent === null || perEvent < 1 || !Number.isInteger(perEvent)) {
        return `Shaping "${s.name}": stitches per shaping row must be a whole number of at least 1.`;
      }
      parsedShaping.push({
        id: s.id,
        name: s.name.trim() || 'Shaping',
        fromId: s.fromId,
        toId: s.toId,
        overId: s.overId,
        stitchesPerEvent: perEvent,
      });
    }

    return {
      units,
      construction,
      stitchRepeat: repeat,
      edgeStitches: edges,
      ease: easeValue,
      measurementsAre,
      baseSizeIndex,
      sizeNames: names,
      gauge: {
        stitches: gauge.stitches,
        rows: gauge.rows,
        widthCm: gauge.widthCm,
        heightCm: gauge.heightCm,
      },
      measurements: parsedMeasurements,
      shaping: parsedShaping,
    };
  };

  const handlePropose = useCallback(async () => {
    const request = buildRequest();
    if (typeof request === 'string') {
      setError(request);
      return;
    }
    setError(null);
    setIsRunning(true);
    setResult(null);
    setApprovedSizes(new Set());
    setCopied(false);
    try {
      const proposal = await proposeGrading(request, idToken);
      setResult(proposal);
    } catch (err) {
      console.error('[grading] propose failed:', err);
      if (err instanceof GradingError && err.code === 'BETA_REQUIRED') {
        setHasAccess(false);
      } else {
        setError(err instanceof Error ? err.message : 'Grading failed. Please try again.');
      }
    } finally {
      setIsRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    idToken, units, construction, measurementsAre, gaugeSts, gaugeRows, gaugeWidth, gaugeHeight,
    stitchRepeat, edgeStitches, ease, sizeNames, baseSizeIndex, measurements, shaping,
  ]);

  // --- Approval & export ---

  const toggleApproval = (index: number) => {
    setApprovedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setCopied(false);
  };

  const approveAll = () => {
    if (!result) return;
    setApprovedSizes(new Set(result.grading.sizeNames.map((_, i) => i)));
    setCopied(false);
  };

  const buildExport = (): string => {
    if (!result) return '';
    const g = result.grading;
    const indices = g.sizeNames.map((_, i) => i).filter((i) => approvedSizes.has(i));
    const lines: string[] = [];
    lines.push(`# Grading (approved sizes: ${indices.map((i) => g.sizeNames[i]).join(', ')})`);
    lines.push('');
    const header = `| Measurement | ${indices.map((i) => g.sizeNames[i]).join(' | ')} |`;
    const divider = `| --- | ${indices.map(() => '---').join(' | ')} |`;
    lines.push(header, divider);
    for (const line of [...g.stitchLines, ...g.rowLines]) {
      const cells = indices.map((i) => {
        const cell = line.perSize[i];
        if (!cell || cell.count === null) return '—';
        return `${cell.count} ${line.countUnit} (${cell.achievedCm} cm)`;
      });
      lines.push(`| ${line.name} | ${cells.join(' | ')} |`);
    }
    for (const plan of g.shapingPlans) {
      lines.push('', `## ${plan.name}`);
      for (const i of indices) {
        const cell = plan.perSize[i];
        if (!cell) continue;
        lines.push(`- ${g.sizeNames[i]}: ${cell.plan ?? cell.problem ?? '—'}`);
      }
    }
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildExport());
      setCopied(true);
    } catch (err) {
      console.error('[grading] copy failed:', err);
      setError('Could not copy to the clipboard.');
    }
  };

  // --- Beta gate ---
  if (hasAccess === false) {
    return (
      <div className="max-w-3xl mx-auto pb-8">
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-8 sm:p-12 text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-primary" aria-hidden>
            straighten
          </span>
          <h2 className="text-2xl font-headline italic text-on-surface">Size grading is in beta</h2>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
            Automatic size grading — recalculated stitch and row counts, distributed shaping and per-size
            checks — is currently available to beta testers only. Apply for beta access and we&rsquo;ll open
            it up for your account.
          </p>
          <a
            href="/beta"
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Apply for beta access
          </a>
        </div>
      </div>
    );
  }

  const unitLabel = units;

  return (
    <div className="max-w-5xl mx-auto text-on-background antialiased pb-8 space-y-6">
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-on-surface font-body">Automatic size grading</h2>
        <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
          Enter your base size, target measurements, ease, gauge and construction rules. StitchSpeak
          recalculates stitches and rows for every size, distributes increases and decreases, flags
          unreasonable jumps between sizes and checks that the pattern still works in each one. The AI
          explains the proposal — <span className="font-medium text-on-surface">you approve the calculations</span>.
        </p>
      </div>

      {/* --- Start from a saved pattern --- */}
      {savedPatterns.length > 0 && (
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4">
          <div>
            <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
              Start from a saved pattern
            </h3>
            <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
              Pick one of your uploaded patterns and StitchSpeak reads every detail from the document —
              gauge, sizes, the full measurement table, shaping, construction and stitch repeat — and fills
              the grading form for you. Review it, adjust anything, then propose the grading.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <SelectDropdown
              className="sm:max-w-md"
              buttonClassName={inputClass}
              value={selectedPatternId}
              onChange={setSelectedPatternId}
              disabled={isExtracting}
              placeholder="Choose a pattern…"
              aria-label="Saved pattern to extract from"
              options={savedPatterns.map((r) => ({
                id: r.id,
                label: r.pdfMetrics ? `${r.fileName} · ${r.pdfMetrics.pages} pages` : r.fileName,
              }))}
            />
            <button
              type="button"
              onClick={() => void handleExtract()}
              disabled={!selectedPatternId || isExtracting || extractTooManyPages}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 shrink-0"
            >
              {isExtracting ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <span className="material-symbols-outlined text-lg" aria-hidden>document_scanner</span>
              )}
              {isExtracting
                ? 'Reading the pattern…'
                : `Extract details${extractCost !== null ? ` (${extractCost.toFixed(1)} credits)` : ''}`}
            </button>
          </div>
          {isExtracting && (
            <p className="text-xs text-on-surface-variant">
              The AI is transcribing the gauge, sizes, measurements and shaping from the document. This can
              take a few minutes — leave the page open.
            </p>
          )}
          {extractTooManyPages && selectedPattern?.pdfMetrics && (
            <p className="rounded-xl border border-error/20 bg-error-container/40 px-4 py-3 text-sm text-on-error-container">
              Extraction supports patterns up to {PRICING.gradingExtract.maxPages} pages — this document has{' '}
              {selectedPattern.pdfMetrics.pages}.
            </p>
          )}
          {(extractedTitle || extractionNotes.length > 0) && !isExtracting && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-900">
                {extractedTitle ? `Extracted from "${extractedTitle}"` : 'Extraction complete'} — review
                the form below before proposing.
              </p>
              {extractionNotes.length > 0 && (
                <ul className="list-disc pl-5 space-y-1">
                  {extractionNotes.map((note, i) => (
                    <li key={i} className="text-sm text-amber-900/85 leading-relaxed">{note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Setup --- */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-5">
        <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
          Gauge & construction
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelClass} htmlFor="grading-gauge-sts">Gauge stitches</label>
            <input id="grading-gauge-sts" className={inputClass} inputMode="decimal" value={gaugeSts} onChange={(e) => setGaugeSts(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="grading-gauge-width">over width (cm)</label>
            <input id="grading-gauge-width" className={inputClass} inputMode="decimal" value={gaugeWidth} onChange={(e) => setGaugeWidth(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="grading-gauge-rows">Gauge rows</label>
            <input id="grading-gauge-rows" className={inputClass} inputMode="decimal" value={gaugeRows} onChange={(e) => setGaugeRows(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="grading-gauge-height">over height (cm)</label>
            <input id="grading-gauge-height" className={inputClass} inputMode="decimal" value={gaugeHeight} onChange={(e) => setGaugeHeight(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <SelectDropdown
              id="grading-units"
              label="Units"
              labelClassName={labelClass}
              buttonClassName={inputClass}
              value={units}
              onChange={(v) => setUnits(v as GradingUnit)}
              options={[
                { id: 'cm', label: 'cm' },
                { id: 'in', label: 'inches' },
              ]}
            />
          </div>
          <div>
            <SelectDropdown
              id="grading-construction"
              label="Construction"
              labelClassName={labelClass}
              buttonClassName={inputClass}
              value={construction}
              onChange={(v) => setConstruction(v as GradingConstruction)}
              options={[
                { id: 'flat', label: 'Flat (back and forth)' },
                { id: 'circular', label: 'In the round' },
              ]}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="grading-repeat">Stitch repeat</label>
            <input id="grading-repeat" className={inputClass} inputMode="numeric" value={stitchRepeat} onChange={(e) => setStitchRepeat(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="grading-edges">Edge stitches</label>
            <input id="grading-edges" className={inputClass} inputMode="numeric" value={edgeStitches} onChange={(e) => setEdgeStitches(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <SelectDropdown
              id="grading-measurements-are"
              label="Measurements are"
              labelClassName={labelClass}
              buttonClassName={inputClass}
              value={measurementsAre}
              onChange={(v) => setMeasurementsAre(v as 'body' | 'finished')}
              options={[
                { id: 'finished', label: 'Finished garment' },
                { id: 'body', label: 'Body (apply ease)' },
              ]}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="grading-ease">
              Ease ({unitLabel}, + or −)
            </label>
            <input
              id="grading-ease"
              className={`${inputClass} ${measurementsAre === 'finished' ? 'opacity-50' : ''}`}
              inputMode="decimal"
              value={ease}
              onChange={(e) => setEase(e.target.value)}
              disabled={measurementsAre === 'finished'}
            />
          </div>
        </div>
      </div>

      {/* --- Sizes & measurements --- */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
            Sizes & target measurements ({unitLabel})
          </h3>
          <button type="button" onClick={addSize} className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
            <span className="material-symbols-outlined text-base" aria-hidden>add</span>
            Add size
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-on-surface-variant px-2 py-1 min-w-44">Measurement</th>
                {sizeNames.map((name, i) => (
                  <th key={i} className="px-1 py-1 min-w-24">
                    <div className="space-y-1">
                      <input
                        className={`${inputClass} text-center font-medium`}
                        value={name}
                        onChange={(e) => renameSize(i, e.target.value)}
                        aria-label={`Size ${i + 1} name`}
                      />
                      <div className="flex items-center justify-center gap-1 text-[10px] text-on-surface-variant">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="grading-base-size"
                            checked={baseSizeIndex === i}
                            onChange={() => setBaseSizeIndex(i)}
                            className="accent-current text-primary"
                          />
                          base
                        </label>
                        {sizeNames.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSize(i)}
                            className="text-on-surface-variant hover:text-error"
                            aria-label={`Remove size ${name}`}
                          >
                            <span className="material-symbols-outlined text-sm" aria-hidden>close</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-1">
                    <div className="flex gap-1.5">
                      <input
                        className={inputClass}
                        value={m.name}
                        onChange={(e) => updateMeasurement(m.id, { name: e.target.value })}
                        aria-label="Measurement name"
                      />
                      <SelectDropdown
                        className="w-auto shrink-0"
                        buttonClassName={`${inputClass} w-auto min-w-28`}
                        value={m.kind}
                        onChange={(v) => updateMeasurement(m.id, { kind: v as GradingMeasurementKind })}
                        aria-label="Measurement kind"
                        options={[
                          { id: 'circumference', label: 'circumf.' },
                          { id: 'width', label: 'width' },
                          { id: 'length', label: 'length' },
                        ]}
                      />
                    </div>
                  </td>
                  {sizeNames.map((_, i) => (
                    <td key={i} className="px-1 py-1">
                      <input
                        className={`${inputClass} text-center`}
                        inputMode="decimal"
                        value={m.values[i] ?? ''}
                        onChange={(e) => setMeasurementValue(m.id, i, e.target.value)}
                        aria-label={`${m.name} for ${sizeNames[i]}`}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => removeMeasurement(m.id)}
                      className="p-1 rounded text-on-surface-variant hover:text-error"
                      aria-label={`Remove ${m.name}`}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-4">
          <button type="button" onClick={() => addMeasurement('circumference')} className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
            <span className="material-symbols-outlined text-base" aria-hidden>add</span>
            Add width/circumference
          </button>
          <button type="button" onClick={() => addMeasurement('length')} className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline">
            <span className="material-symbols-outlined text-base" aria-hidden>add</span>
            Add length
          </button>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          Use custom body measurements if you have them — switch &ldquo;Measurements are&rdquo; to
          &ldquo;Body&rdquo; and StitchSpeak applies your ease on top. Leave a cell empty to skip that size.
        </p>
      </div>

      {/* --- Shaping --- */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
            Shaping segments
          </h3>
          <button
            type="button"
            onClick={addShaping}
            disabled={widthMeasurements.length === 0 || lengthMeasurements.length === 0}
            className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline disabled:opacity-40 disabled:no-underline"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>add</span>
            Add shaping
          </button>
        </div>
        {shaping.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            Optional: tell StitchSpeak where the piece changes width (e.g. waist to bust over the side
            length) and it distributes the increases/decreases evenly for every size.
          </p>
        ) : (
          <div className="space-y-3">
            {shaping.map((s) => (
              <div key={s.id} className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4 grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelClass}>Name</label>
                  <input className={inputClass} value={s.name} onChange={(e) => updateShaping(s.id, { name: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>From</label>
                  <SelectDropdown
                    buttonClassName={inputClass}
                    value={s.fromId}
                    onChange={(fromId) => updateShaping(s.id, { fromId })}
                    options={widthMeasurements.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>To</label>
                  <SelectDropdown
                    buttonClassName={inputClass}
                    value={s.toId}
                    onChange={(toId) => updateShaping(s.id, { toId })}
                    options={widthMeasurements.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Over</label>
                  <SelectDropdown
                    buttonClassName={inputClass}
                    value={s.overId}
                    onChange={(overId) => updateShaping(s.id, { overId })}
                    options={lengthMeasurements.map((m) => ({ id: m.id, label: m.name }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Sts per shaping row</label>
                  <input className={inputClass} inputMode="numeric" value={s.stitchesPerEvent} onChange={(e) => updateShaping(s.id, { stitchesPerEvent: e.target.value })} />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeShaping(s.id)}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-error"
                    aria-label={`Remove ${s.name}`}
                  >
                    <span className="material-symbols-outlined text-lg" aria-hidden>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-error-container/50 px-3 py-2 text-sm font-medium text-on-error-container" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handlePropose()}
        disabled={isRunning}
        className="w-full sm:w-auto bg-primary text-on-primary px-8 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {isRunning ? (
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <span className="material-symbols-outlined text-lg" aria-hidden>straighten</span>
        )}
        {isRunning ? 'Grading…' : 'Propose grading'}
      </button>

      {/* --- Results --- */}
      {result && (
        <div className="space-y-6">
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-primary font-medium tracking-widest text-[10px] sm:text-xs uppercase mb-1">
                  Grading proposal
                </p>
                <h3 className="text-xl font-headline italic text-on-surface">
                  {result.grading.sizeNames.length} sizes · {result.grading.checksRun} calculations run
                </h3>
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                title="Every number was computed deterministically from your gauge and measurements — not by the AI."
              >
                <span className="material-symbols-outlined text-xs" aria-hidden>calculate</span>
                Verified by calculation
              </span>
            </div>

            {result.explanation?.summary && (
              <p className="text-sm sm:text-base text-on-surface leading-relaxed border-l-2 border-primary/40 pl-4">
                {result.explanation.summary}
              </p>
            )}
          </div>

          {result.grading.warnings.length > 0 && (
            <div className="space-y-3">
              {result.grading.warnings.map((w, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 space-y-1.5 ${
                    w.severity === 'critical'
                      ? 'border-error/25 bg-error-container/40'
                      : 'border-amber-300/60 bg-amber-50'
                  }`}
                >
                  <p className={`text-sm font-semibold ${w.severity === 'critical' ? 'text-on-error-container' : 'text-amber-800'}`}>
                    {w.title}
                  </p>
                  <p className={`text-sm leading-relaxed ${w.severity === 'critical' ? 'text-on-error-container/90' : 'text-amber-900/80'}`}>
                    {w.detail}
                  </p>
                  {w.calculation && (
                    <p className="rounded-lg bg-surface-container-high/70 px-3 py-1.5 font-mono text-xs text-on-surface overflow-x-auto">
                      {w.calculation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Counts table */}
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4 overflow-x-auto">
            <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
              Stitch & row counts
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-on-surface-variant">
                  <th className="py-2 pr-3 font-medium">Measurement</th>
                  {result.grading.sizeNames.map((name, i) => (
                    <th key={i} className={`py-2 px-2 font-medium text-center ${i === result.grading.baseSizeIndex ? 'text-primary' : ''}`}>
                      {name}
                      {i === result.grading.baseSizeIndex ? ' (base)' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...result.grading.stitchLines, ...result.grading.rowLines].map((line) => (
                  <tr key={line.measurementId} className="border-t border-outline-variant/15">
                    <td className="py-2.5 pr-3 font-medium text-on-surface">
                      {line.name}
                      <span className="text-xs text-on-surface-variant font-normal"> · {line.countUnit}</span>
                    </td>
                    {line.perSize.map((cell, i) => (
                      <td key={i} className="py-2.5 px-2 text-center">
                        {cell.count === null ? (
                          <span className="text-on-surface-variant">—</span>
                        ) : (
                          <div>
                            <p className="font-semibold text-on-surface tabular-nums">{cell.count}</p>
                            <p className="text-[11px] text-on-surface-variant tabular-nums">
                              {cell.achievedCm} cm
                              {cell.finishedCm !== null && cell.achievedCm !== cell.finishedCm
                                ? ` (target ${cell.finishedCm})`
                                : ''}
                            </p>
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-on-surface-variant">
              Counts are rounded to your stitch repeat{construction === 'flat' ? ', plus edge stitches; row counts are rounded to even numbers so sections end after a WS row' : ''}.
              When rounding moved a dimension, the achieved measurement is shown next to the target.
            </p>
          </div>

          {/* Shaping plans */}
          {result.grading.shapingPlans.length > 0 && (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-5">
              <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
                Shaping distribution
              </h3>
              {result.grading.shapingPlans.map((plan) => (
                <div key={plan.shapingId} className="space-y-2">
                  <p className="text-sm font-semibold text-on-surface">{plan.name}</p>
                  <div className="space-y-1.5">
                    {plan.perSize.map((cell, i) => (
                      <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                        <span className="w-16 shrink-0 font-medium text-on-surface-variant">
                          {result.grading.sizeNames[i]}
                        </span>
                        {cell.plan ? (
                          <span className="text-on-surface">
                            {cell.startCount} → {cell.endCount} sts: {cell.plan}
                          </span>
                        ) : cell.problem ? (
                          <span className="text-error">{cell.problem}</span>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI explanation */}
          {result.explanation && (result.explanation.sizeNotes.length > 0 || result.explanation.cautions.length > 0) && (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-xs uppercase tracking-widest text-on-surface-variant">
                  AI explanation
                </h3>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant"
                  title="Written by the AI to explain the deterministic proposal — it does not change any number."
                >
                  <span className="material-symbols-outlined text-xs" aria-hidden>auto_awesome</span>
                  AI review
                </span>
              </div>
              {result.explanation.sizeNotes.length > 0 && (
                <div className="space-y-1.5">
                  {result.explanation.sizeNotes.map((note, i) => (
                    <p key={i} className="text-sm text-on-surface leading-relaxed">
                      <span className="font-semibold">{note.sizeName}: </span>
                      {note.note}
                    </p>
                  ))}
                </div>
              )}
              {result.explanation.cautions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
                    Check before approving
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    {result.explanation.cautions.map((c, i) => (
                      <li key={i} className="text-sm text-on-surface-variant leading-relaxed">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Approval */}
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm text-on-surface">Approve the calculations</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Review each size, tick the ones you accept, then copy the approved grading into your pattern.
                </p>
              </div>
              <button type="button" onClick={approveAll} className="text-sm text-primary font-medium hover:underline">
                Approve all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.grading.sizeNames.map((name, i) => {
                const approved = approvedSizes.has(i);
                const hasCritical = result.grading.warnings.some(
                  (w) => w.severity === 'critical' && w.sizeName === name,
                );
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleApproval(i)}
                    aria-pressed={approved}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      approved
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-lowest text-on-surface border-outline-variant/40 hover:border-primary/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden>
                      {approved ? 'check_circle' : hasCritical ? 'error' : 'radio_button_unchecked'}
                    </span>
                    {name}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={approvedSizes.size === 0}
              className="w-full sm:w-auto bg-primary text-on-primary px-8 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden>
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied!' : `Copy approved grading (${approvedSizes.size})`}
            </button>
          </div>

          <p className="text-xs text-on-surface-variant/80 text-center px-4">
            All counts are computed from your gauge and measurements by software; the AI only explains them.
            You stay responsible for the final numbers — approve each size before using the grading.
          </p>
        </div>
      )}

      <BuyCreditsModal
        isOpen={isBuyCreditsOpen}
        onClose={() => setIsBuyCreditsOpen(false)}
        onPurchase={handleCreditPurchase}
      />
    </div>
  );
};
