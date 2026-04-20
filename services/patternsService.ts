import type { TranslationRecord } from '../types';

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || '';
}

interface ServerPattern {
  id: string;
  timestamp: number;
  fileName: string;
  fileType: string | null;
  sourceLanguage: string | null;
  targetLanguage: string;
  pdfMetrics: TranslationRecord['pdfMetrics'] | null;
  cost: number;
}

interface ServerPatternWithHtml extends ServerPattern {
  html: string;
}

async function apiFetch<T>(
  path: string,
  idToken: string,
  method = 'GET',
  body?: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
  };
  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/patterns${path}`, init);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({} as Record<string, unknown>));

  if (!res.ok) {
    const err = new Error(
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Patterns API error ${res.status}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return data as T;
}

function toRecord(server: ServerPattern): TranslationRecord {
  return {
    id: server.id,
    timestamp: server.timestamp,
    fileName: server.fileName,
    fileType: server.fileType ?? 'unknown',
    sourceLanguage: server.sourceLanguage ?? undefined,
    targetLanguage: server.targetLanguage,
    pdfMetrics: server.pdfMetrics ?? null,
    cost: server.cost,
  };
}

export async function listPatterns(idToken: string): Promise<TranslationRecord[]> {
  const data = await apiFetch<{ patterns: ServerPattern[] }>('/', idToken);
  return (data.patterns ?? []).map(toRecord);
}

export async function getPatternHtml(idToken: string, id: string): Promise<string | null> {
  try {
    const data = await apiFetch<{ pattern: ServerPatternWithHtml }>(
      `/${encodeURIComponent(id)}`,
      idToken,
    );
    return data.pattern?.html ?? null;
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export interface SavePatternRequest {
  fileName: string;
  fileType?: string;
  sourceLanguage?: string;
  targetLanguage: string;
  html: string;
  pdfMetrics: TranslationRecord['pdfMetrics'] | null;
  cost: number;
}

export async function savePattern(
  idToken: string,
  input: SavePatternRequest,
): Promise<TranslationRecord> {
  const data = await apiFetch<{ pattern: ServerPattern }>('/', idToken, 'POST', {
    fileName: input.fileName,
    fileType: input.fileType,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    pdfMetrics: input.pdfMetrics,
    cost: input.cost,
    html: input.html,
  });
  return toRecord(data.pattern);
}

export async function deletePattern(idToken: string, id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/${encodeURIComponent(id)}`, idToken, 'DELETE');
}

export async function clearPatterns(idToken: string): Promise<void> {
  await apiFetch<{ ok: boolean }>('/', idToken, 'DELETE');
}
