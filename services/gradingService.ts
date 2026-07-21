import type {
  GradingExplanation,
  GradingExtraction,
  GradingRequestInput,
  GradingResult,
} from '../types';
import { apiUrl, authHeaders } from './apiBase';

export class GradingError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'GradingError';
  }
}

async function throwFromResponse(response: Response, label: string): Promise<never> {
  const body = await response.json().catch(() => null);
  const serverMsg = typeof body?.error === 'string' ? body.error : null;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  throw new GradingError(serverMsg || `${label} failed (${response.status}).`, response.status, code);
}

export async function checkGradingAccess(idToken: string | null): Promise<boolean> {
  const response = await fetch(apiUrl('/grading/access'), {
    headers: authHeaders(idToken),
    credentials: 'include',
  });
  if (!response.ok) await throwFromResponse(response, 'Checking access');
  const data = await response.json();
  return data.access === true;
}

export interface ProposeGradingResult {
  grading: GradingResult;
  explanation: GradingExplanation | null;
}

export interface ExtractGradingResult {
  extraction: GradingExtraction;
  cost?: number;
  balance?: number;
}

interface ExtractNdjsonEvent {
  type: 'ping' | 'stage' | 'done' | 'error';
  extraction?: GradingExtraction;
  cost?: number;
  balance?: number;
  message?: string;
}

/**
 * Extract grading inputs from an already-uploaded pattern's stored source.
 * Consumes NDJSON progress events; the Gemini extraction can take minutes.
 */
export async function extractGradingFromPattern(
  patternId: string,
  idToken: string | null,
): Promise<ExtractGradingResult> {
  let response: Response;
  try {
    response = await fetch(apiUrl('/grading/extract'), {
      method: 'POST',
      headers: {
        ...authHeaders(idToken),
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({ patternId }),
      credentials: 'include',
    });
  } catch {
    throw new GradingError('Could not reach the server. Check your connection and try again.');
  }
  if (!response.ok) await throwFromResponse(response, 'Grading extraction');

  const body = response.body;
  if (!body) throw new GradingError('The server response was empty. Please try again.');

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let result: ExtractGradingResult | null = null;
  let streamError: string | null = null;

  const handleEvent = (event: ExtractNdjsonEvent): void => {
    if (event.type === 'done' && event.extraction) {
      result = { extraction: event.extraction, cost: event.cost, balance: event.balance };
    } else if (event.type === 'error') {
      streamError = event.message || 'Grading extraction failed.';
    }
  };

  const flushBuffer = (final: boolean): void => {
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
      const rawLine = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!rawLine) continue;
      try {
        handleEvent(JSON.parse(rawLine) as ExtractNdjsonEvent);
      } catch {
        /* skip malformed line */
      }
    }
    if (final && buffer.trim().length > 0) {
      try {
        handleEvent(JSON.parse(buffer.trim()) as ExtractNdjsonEvent);
      } catch {
        /* skip malformed trailing line */
      }
      buffer = '';
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flushBuffer(false);
    }
    buffer += decoder.decode();
    flushBuffer(true);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new GradingError('The connection was interrupted during the extraction.');
    }
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) throw new GradingError(streamError);
  if (!result) throw new GradingError('The extraction ended unexpectedly. Please try again.');
  return result;
}

export async function proposeGrading(
  input: GradingRequestInput,
  idToken: string | null,
): Promise<ProposeGradingResult> {
  let response: Response;
  try {
    response = await fetch(apiUrl('/grading/propose'), {
      method: 'POST',
      headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
  } catch {
    throw new GradingError('Could not reach the server. Check your connection and try again.');
  }
  if (!response.ok) await throwFromResponse(response, 'Grading');
  const data = await response.json();
  if (!data?.grading) throw new GradingError('The server returned an empty grading. Please try again.');
  return { grading: data.grading, explanation: data.explanation ?? null };
}
