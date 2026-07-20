import type { TechEditRecord, TechEditReport, TechEditStage } from '../types';
import { apiUrl, authHeaders } from './apiBase';

export class TechEditError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'TechEditError';
  }
}

async function throwFromResponse(response: Response, label: string): Promise<never> {
  const body = await response.json().catch(() => null);
  const serverMsg = typeof body?.error === 'string' ? body.error : null;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  throw new TechEditError(serverMsg || `${label} failed (${response.status}).`, response.status, code);
}

export interface TechEditListResult {
  reports: TechEditRecord[];
  /** Whether this account can run tech edits (beta gate). */
  access: boolean;
}

export async function listTechEdits(idToken: string | null): Promise<TechEditListResult> {
  const response = await fetch(apiUrl('/tech-edit'), {
    headers: authHeaders(idToken),
    credentials: 'include',
  });
  if (!response.ok) await throwFromResponse(response, 'Loading reports');
  const data = await response.json();
  return {
    reports: Array.isArray(data.reports) ? data.reports : [],
    access: data.access === true,
  };
}

export async function getTechEdit(
  idToken: string | null,
  id: string,
): Promise<TechEditRecord & { report: TechEditReport }> {
  const response = await fetch(apiUrl(`/tech-edit/${encodeURIComponent(id)}`), {
    headers: authHeaders(idToken),
    credentials: 'include',
  });
  if (!response.ok) await throwFromResponse(response, 'Loading report');
  const data = await response.json();
  return data.report;
}

export async function deleteTechEdit(idToken: string | null, id: string): Promise<void> {
  const response = await fetch(apiUrl(`/tech-edit/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: authHeaders(idToken),
    credentials: 'include',
  });
  if (!response.ok) await throwFromResponse(response, 'Deleting report');
}

export interface RunTechEditCallbacks {
  onStage?: (stage: TechEditStage, detail?: string) => void;
}

export interface RunTechEditResult {
  report: TechEditReport;
  reportId: string | null;
  cost?: number;
  balance?: number;
}

interface NdjsonEvent {
  type: 'ping' | 'stage' | 'done' | 'error';
  stage?: TechEditStage;
  detail?: string;
  report?: TechEditReport;
  reportId?: string | null;
  cost?: number;
  balance?: number;
  message?: string;
}

/**
 * Upload a pattern and run the tech edit, consuming NDJSON progress events.
 * Resolves with the final report; stage callbacks fire as the server advances
 * through extraction → verification → editorial review.
 */
export async function runTechEdit(
  file: File,
  idToken: string | null,
  callbacks: RunTechEditCallbacks = {},
): Promise<RunTechEditResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('aiAcknowledged', 'true');

  let response: Response;
  try {
    response = await fetch(apiUrl('/tech-edit'), {
      method: 'POST',
      headers: { ...authHeaders(idToken), Accept: 'application/x-ndjson' },
      body: formData,
      credentials: 'include',
    });
  } catch {
    throw new TechEditError('Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) await throwFromResponse(response, 'Tech edit');

  const body = response.body;
  if (!body) throw new TechEditError('The server response was empty. Please try again.');

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let result: RunTechEditResult | null = null;
  let streamError: string | null = null;

  const handleEvent = (event: NdjsonEvent): void => {
    switch (event.type) {
      case 'stage':
        if (event.stage) callbacks.onStage?.(event.stage, event.detail);
        return;
      case 'done':
        if (event.report) {
          result = {
            report: event.report,
            reportId: event.reportId ?? null,
            cost: event.cost,
            balance: event.balance,
          };
        }
        return;
      case 'error':
        streamError = event.message || 'Tech edit failed.';
        return;
      default:
        return;
    }
  };

  const flushBuffer = (final: boolean): void => {
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
      const rawLine = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!rawLine) continue;
      try {
        handleEvent(JSON.parse(rawLine) as NdjsonEvent);
      } catch {
        /* skip malformed line */
      }
    }
    if (final && buffer.trim().length > 0) {
      try {
        handleEvent(JSON.parse(buffer.trim()) as NdjsonEvent);
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
      throw new TechEditError('The connection was interrupted while running the tech edit.');
    }
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) throw new TechEditError(streamError);
  if (!result) throw new TechEditError('The tech edit ended unexpectedly. Please try again.');
  return result;
}
