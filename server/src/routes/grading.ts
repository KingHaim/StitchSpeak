import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { isAdminIdentity } from '../middleware/admin.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { hasActiveBetaAccess } from '../services/betaApplicationStore.js';
import { externalErrorStatus } from '../services/externalDeadline.js';
import {
  gradePattern,
  type GradingGauge,
  type GradingMeasurementInput,
  type GradingRequestInput,
  type GradingShapingInput,
} from '../services/grading.js';
import { explainGrading, type GradingExplanation } from '../services/gradingReview.js';

const router = Router();

router.use(requireAuth);
// The deterministic engine is cheap; the explanation is one Flash call with a
// small JSON payload. Still, keep a sane per-user ceiling.
router.use(rateLimit({ windowMs: 60_000, max: 20, name: 'grading' }));

// Grading shares the tech-editing beta gate: designer tooling, invite-only
// for now. Flip to `() => true` for general availability.
function hasGradingAccess(req: AuthenticatedRequest): boolean {
  return hasActiveBetaAccess(req.userEmail) || isAdminIdentity(req);
}

const MAX_SIZES = 20;
const MAX_MEASUREMENTS = 20;
const MAX_SHAPING = 10;
const MAX_VALUE = 10_000;

function asBoundedNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function asShortString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function parseValues(value: unknown, sizeCount: number): (number | null)[] | null {
  if (!Array.isArray(value) || value.length !== sizeCount) return null;
  const out: (number | null)[] = [];
  for (const v of value) {
    if (v === null) {
      out.push(null);
    } else {
      const n = asBoundedNumber(v, 0, MAX_VALUE);
      if (n === null) return null;
      out.push(n);
    }
  }
  return out;
}

/** Validate the untrusted request body into a GradingRequestInput, or return an error string. */
function parseGradingRequest(body: unknown): GradingRequestInput | string {
  const obj = (body ?? {}) as Record<string, unknown>;

  const units = obj.units === 'in' ? 'in' : obj.units === 'cm' ? 'cm' : null;
  if (!units) return 'units must be "cm" or "in".';
  const construction =
    obj.construction === 'flat' ? 'flat' : obj.construction === 'circular' ? 'circular' : null;
  if (!construction) return 'construction must be "flat" or "circular".';
  const measurementsAre =
    obj.measurementsAre === 'body' ? 'body' : obj.measurementsAre === 'finished' ? 'finished' : null;
  if (!measurementsAre) return 'measurementsAre must be "body" or "finished".';

  const stitchRepeat = asBoundedNumber(obj.stitchRepeat, 1, 100);
  if (stitchRepeat === null || !Number.isInteger(stitchRepeat)) {
    return 'stitchRepeat must be a whole number between 1 and 100.';
  }
  const edgeStitches = asBoundedNumber(obj.edgeStitches, 0, 50);
  if (edgeStitches === null || !Number.isInteger(edgeStitches)) {
    return 'edgeStitches must be a whole number between 0 and 50.';
  }
  const ease = asBoundedNumber(obj.ease, -100, 100);
  if (ease === null) return 'ease must be a number between -100 and 100.';

  const sizeNamesRaw = Array.isArray(obj.sizeNames) ? obj.sizeNames : null;
  if (!sizeNamesRaw || sizeNamesRaw.length === 0 || sizeNamesRaw.length > MAX_SIZES) {
    return `sizeNames must contain between 1 and ${MAX_SIZES} sizes.`;
  }
  const sizeNames: string[] = [];
  for (const s of sizeNamesRaw) {
    const name = asShortString(s, 40);
    if (!name) return 'Every size needs a name of at most 40 characters.';
    sizeNames.push(name);
  }

  const baseSizeIndex = asBoundedNumber(obj.baseSizeIndex, 0, sizeNames.length - 1);
  if (baseSizeIndex === null || !Number.isInteger(baseSizeIndex)) {
    return 'baseSizeIndex must point at one of the sizes.';
  }

  const gaugeRaw = (obj.gauge ?? {}) as Record<string, unknown>;
  const gauge: GradingGauge = {
    stitches: asBoundedNumber(gaugeRaw.stitches, 0.1, 400) ?? 0,
    rows: asBoundedNumber(gaugeRaw.rows, 0.1, 400) ?? 0,
    widthCm: asBoundedNumber(gaugeRaw.widthCm, 0.1, 100) ?? 0,
    heightCm: asBoundedNumber(gaugeRaw.heightCm, 0.1, 100) ?? 0,
  };
  if (!gauge.stitches || !gauge.rows || !gauge.widthCm || !gauge.heightCm) {
    return 'gauge needs stitches, rows, widthCm and heightCm, all positive.';
  }

  const measurementsRaw = Array.isArray(obj.measurements) ? obj.measurements : null;
  if (!measurementsRaw || measurementsRaw.length === 0 || measurementsRaw.length > MAX_MEASUREMENTS) {
    return `measurements must contain between 1 and ${MAX_MEASUREMENTS} entries.`;
  }
  const measurements: GradingMeasurementInput[] = [];
  const measurementIds = new Set<string>();
  for (const m of measurementsRaw) {
    const raw = (m ?? {}) as Record<string, unknown>;
    const id = asShortString(raw.id, 60);
    const name = asShortString(raw.name, 80);
    const kind =
      raw.kind === 'circumference' || raw.kind === 'width' || raw.kind === 'length' ? raw.kind : null;
    const values = parseValues(raw.values, sizeNames.length);
    if (!id || !name || !kind || !values) {
      return 'Every measurement needs an id, a name, a kind (circumference/width/length) and one value or null per size.';
    }
    if (measurementIds.has(id)) return `Duplicate measurement id "${id}".`;
    measurementIds.add(id);
    measurements.push({ id, name, kind, values });
  }

  const shapingRaw = Array.isArray(obj.shaping) ? obj.shaping : [];
  if (shapingRaw.length > MAX_SHAPING) return `shaping supports at most ${MAX_SHAPING} segments.`;
  const shaping: GradingShapingInput[] = [];
  for (const s of shapingRaw) {
    const raw = (s ?? {}) as Record<string, unknown>;
    const id = asShortString(raw.id, 60);
    const name = asShortString(raw.name, 80);
    const fromId = asShortString(raw.fromId, 60);
    const toId = asShortString(raw.toId, 60);
    const overId = asShortString(raw.overId, 60);
    const stitchesPerEvent = asBoundedNumber(raw.stitchesPerEvent, 1, 50);
    if (!id || !name || !fromId || !toId || !overId || stitchesPerEvent === null || !Number.isInteger(stitchesPerEvent)) {
      return 'Every shaping segment needs an id, a name, fromId, toId, overId and stitchesPerEvent (1–50).';
    }
    const from = measurements.find((m) => m.id === fromId);
    const to = measurements.find((m) => m.id === toId);
    const over = measurements.find((m) => m.id === overId);
    if (!from || from.kind === 'length') return `Shaping "${name}": fromId must reference a width/circumference measurement.`;
    if (!to || to.kind === 'length') return `Shaping "${name}": toId must reference a width/circumference measurement.`;
    if (!over || over.kind !== 'length') return `Shaping "${name}": overId must reference a length measurement.`;
    shaping.push({ id, name, fromId, toId, overId, stitchesPerEvent });
  }

  return {
    units,
    construction,
    stitchRepeat,
    edgeStitches,
    ease,
    measurementsAre,
    baseSizeIndex,
    sizeNames,
    gauge,
    measurements,
    shaping,
  };
}

router.get('/access', (req, res: Response) => {
  res.json({ access: hasGradingAccess(req as AuthenticatedRequest) });
});

router.post('/propose', async (req: Request, res: Response) => {
  const authedReq = req as AuthenticatedRequest;
  if (!hasGradingAccess(authedReq)) {
    res.status(403).json({
      error: 'Size grading is currently in beta. Apply for beta access to try it.',
      code: 'BETA_REQUIRED',
    });
    return;
  }

  const parsed = parseGradingRequest(req.body);
  if (typeof parsed === 'string') {
    res.status(400).json({ error: parsed });
    return;
  }

  try {
    const grading = gradePattern(parsed);

    // The explanation is a nice-to-have: if the model is down the designer
    // still gets the full deterministic proposal and can approve it.
    let explanation: GradingExplanation | null = null;
    try {
      explanation = await explainGrading(parsed, grading);
    } catch (err) {
      console.warn('[grading] explanation failed, returning proposal without it:', err);
    }

    res.json({ grading, explanation });
  } catch (err: any) {
    console.error('[grading] Error:', err);
    res.status(externalErrorStatus(err)).json({ error: err.message || 'Grading failed.' });
  }
});

export default router;
