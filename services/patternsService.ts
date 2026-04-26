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
  hasSource?: boolean;
  sourceMime?: string | null;
  sourceSize?: number | null;
  sourceExt?: string | null;
  hasThumbnail?: boolean;
  thumbSize?: number | null;
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

  const ct = res.headers.get('content-type') ?? '';
  if (res.ok && !ct.includes('application/json')) {
    throw new Error(
      'The patterns API did not return JSON (often the static app’s index.html). Set VITE_API_URL to your StitchSpeak API origin, or use npm run dev so /api is proxied to the backend.',
    );
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
    hasSource: server.hasSource ?? false,
    hasThumbnail: server.hasThumbnail ?? false,
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

/**
 * Upload the original source file (PDF/DOCX) for an existing pattern row.
 * Best-effort: callers should swallow errors here so that a save still
 * succeeds even if the source upload fails.
 */
export async function uploadPatternSource(
  idToken: string,
  id: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);

  let res: Response;
  try {
    res = await fetch(
      `${getApiUrl()}/api/patterns/${encodeURIComponent(id)}/source`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      },
    );
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const err = new Error(
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Source upload failed (${res.status})`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

/**
 * Fetch the stored original source file as a `File` so it can be fed back into
 * the translation pipeline (e.g. "Add another translation" on a saved pattern).
 * Returns null when the pattern has no source on file (older saves, deleted, etc.).
 */
export async function fetchPatternSource(
  idToken: string,
  id: string,
): Promise<File | null> {
  let res: Response;
  try {
    res = await fetch(
      `${getApiUrl()}/api/patterns/${encodeURIComponent(id)}/source`,
      {
        headers: { Authorization: `Bearer ${idToken}` },
      },
    );
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const err = new Error(
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Source fetch failed (${res.status})`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] || `pattern-${id}`;
  const mime = res.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = await res.arrayBuffer();
  return new File([buffer], fileName, { type: mime });
}

/**
 * Upload a small page-1 JPEG thumbnail for a pattern. Best-effort: failures
 * here should never break the save flow, since the gallery falls back to a
 * deterministic placeholder when no thumbnail is on file.
 */
export async function uploadPatternThumbnail(
  idToken: string,
  id: string,
  blob: Blob,
): Promise<void> {
  const form = new FormData();
  form.append('file', blob, `pattern-${id}.jpg`);

  const res = await fetch(
    `${getApiUrl()}/api/patterns/${encodeURIComponent(id)}/thumb`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const err = new Error(
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Thumbnail upload failed (${res.status})`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

/**
 * Fetch the stored thumbnail as a `Blob`. Returns `null` when the pattern has
 * no thumbnail on file (older saves, non-PDF sources, etc.).
 */
export async function fetchPatternThumbnail(
  idToken: string,
  id: string,
): Promise<Blob | null> {
  const res = await fetch(
    `${getApiUrl()}/api/patterns/${encodeURIComponent(id)}/thumb`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Thumbnail fetch failed (${res.status})`);
  }
  return await res.blob();
}

export interface ServerChatMessage {
  role: 'user' | 'model';
  content: string;
  createdAt: number;
}

export interface ServerChatState {
  messages: ServerChatMessage[];
  /** Extra messages already paid for on top of the free allowance. */
  extraAllowance: number;
}

/** Fetch persisted chat history + paid allowance for a saved pattern. */
export async function fetchPatternChatState(
  idToken: string,
  id: string,
): Promise<ServerChatState | null> {
  try {
    const data = await apiFetch<ServerChatState>(
      `/${encodeURIComponent(id)}/chat`,
      idToken,
    );
    return {
      messages: data.messages ?? [],
      extraAllowance: typeof data.extraAllowance === 'number' ? data.extraAllowance : 0,
    };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Append one or more chat messages to a pattern's persisted history. */
export async function appendPatternChatMessages(
  idToken: string,
  id: string,
  messages: { role: 'user' | 'model'; content: string }[],
): Promise<void> {
  if (messages.length === 0) return;
  await apiFetch<{ ok: boolean; appended: number }>(
    `/${encodeURIComponent(id)}/chat`,
    idToken,
    'POST',
    { messages },
  );
}

/** Bump the per-pattern paid chat allowance by `by` messages. */
export async function unlockPatternChatAllowance(
  idToken: string,
  id: string,
  by: number,
): Promise<number> {
  const data = await apiFetch<{ ok: boolean; extraAllowance: number }>(
    `/${encodeURIComponent(id)}/chat/unlock`,
    idToken,
    'POST',
    { by },
  );
  return data.extraAllowance;
}
