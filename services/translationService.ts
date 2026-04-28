import type { TranslationResult } from '../types';

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || '';
}

class TranslationError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'server' | 'unknown',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

async function checkedFetch(
  input: RequestInfo,
  init?: RequestInit,
  label = 'Request',
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new TranslationError(
        'Could not reach the server. Check your connection and try again.',
        'network',
      );
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TranslationError(
        'The request timed out. The file may be too large — try a smaller pattern.',
        'timeout',
      );
    }
    throw new TranslationError(
      `${label} failed unexpectedly. Please try again.`,
      'unknown',
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const serverMsg = typeof body?.error === 'string' ? body.error : null;

    if (response.status === 401) {
      throw new TranslationError(
        'You must be signed in to use this feature.',
        'server',
        401,
      );
    }
    if (response.status === 413) {
      throw new TranslationError(
        'The file is too large for the server to process. Try a smaller file.',
        'server',
        413,
      );
    }
    if (response.status === 429) {
      throw new TranslationError(
        'Too many requests — please wait a moment and try again.',
        'server',
        429,
      );
    }
    if (response.status >= 500) {
      throw new TranslationError(
        serverMsg || 'The server encountered an error. Please try again later.',
        'server',
        response.status,
      );
    }
    throw new TranslationError(
      serverMsg || `${label} failed (${response.status}).`,
      'server',
      response.status,
    );
  }

  return response;
}

function authHeaders(idToken: string | null): Record<string, string> {
  if (!idToken) return {};
  return { Authorization: `Bearer ${idToken}` };
}

export { TranslationError };

export const translatePattern = async (
  file: File,
  language: string,
  idToken: string | null,
  sourceLanguage?: string,
): Promise<TranslationResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', language);
  if (sourceLanguage) {
    formData.append('sourceLanguage', sourceLanguage);
  }

  const response = await checkedFetch(
    `${getApiUrl()}/api/translate`,
    { method: 'POST', headers: authHeaders(idToken), body: formData },
    'Translation',
  );

  return response.json();
};

export interface TranslatePatternStreamCallbacks {
  /**
   * Called for every text delta received from the server. The accumulated
   * string is the live, raw HTML coming from Gemini. Image markers like
   * `[IMG_5]` will be visible until the final result arrives.
   */
  onDelta?: (delta: string, accumulated: string) => void;
}

interface NdjsonDeltaEvent {
  type: 'delta';
  text: string;
}

interface NdjsonDoneEvent {
  type: 'done';
  html: string;
  usage: TranslationResult['usage'];
}

interface NdjsonErrorEvent {
  type: 'error';
  message: string;
}

type NdjsonEvent = NdjsonDeltaEvent | NdjsonDoneEvent | NdjsonErrorEvent;

/**
 * Streaming variant of translatePattern. Sends `Accept: application/x-ndjson`
 * and consumes NDJSON events from the server, invoking `onDelta` as raw text
 * arrives and resolving with the final marker-replaced HTML + usage totals.
 */
export const translatePatternStream = async (
  file: File,
  language: string,
  idToken: string | null,
  sourceLanguage: string | undefined,
  callbacks: TranslatePatternStreamCallbacks = {},
): Promise<TranslationResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', language);
  if (sourceLanguage) {
    formData.append('sourceLanguage', sourceLanguage);
  }

  const response = await checkedFetch(
    `${getApiUrl()}/api/translate`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(idToken),
        Accept: 'application/x-ndjson',
      },
      body: formData,
    },
    'Translation',
  );

  // If the server fell back to plain JSON (e.g. an old deployment that doesn't
  // know how to stream), just consume it as a normal response.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/x-ndjson')) {
    const data = (await response.json()) as TranslationResult;
    callbacks.onDelta?.(data.html, data.html);
    return data;
  }

  const body = response.body;
  if (!body) {
    throw new TranslationError(
      'The server response was empty. Please try again.',
      'server',
    );
  }

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let accumulated = '';
  let finalResult: TranslationResult | null = null;
  let streamError: string | null = null;

  const handleEvent = (event: NdjsonEvent): void => {
    switch (event.type) {
      case 'delta': {
        const text = event.text;
        if (typeof text !== 'string' || text.length === 0) return;
        accumulated += text;
        callbacks.onDelta?.(text, accumulated);
        return;
      }
      case 'done': {
        finalResult = { html: event.html, usage: event.usage ?? null };
        return;
      }
      case 'error': {
        streamError = event.message || 'Translation failed.';
        return;
      }
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
      } catch (parseErr) {
        console.warn('[translatePatternStream] Skipping malformed NDJSON line:', parseErr);
      }
    }
    if (final && buffer.trim().length > 0) {
      try {
        handleEvent(JSON.parse(buffer.trim()) as NdjsonEvent);
      } catch (parseErr) {
        console.warn('[translatePatternStream] Skipping malformed trailing line:', parseErr);
      }
      buffer = '';
    }
  };

  try {
    // eslint-disable-next-line no-constant-condition
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
      throw new TranslationError(
        'The connection to the server was interrupted while streaming the translation.',
        'network',
      );
    }
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) {
    throw new TranslationError(streamError, 'server');
  }

  if (!finalResult) {
    // Server closed without a `done` event. Salvage what we have if anything.
    if (accumulated.length > 0) {
      return { html: accumulated, usage: null };
    }
    throw new TranslationError(
      'Translation ended unexpectedly. Please try again.',
      'server',
    );
  }

  return finalResult;
};

export interface PriorChatMessage {
  role: 'user' | 'model';
  content: string;
}

export const startChatSession = async (
  patternHtml: string,
  idToken: string,
  priorMessages: PriorChatMessage[] = [],
): Promise<string> => {
  const response = await checkedFetch(
    `${getApiUrl()}/api/chat/start`,
    {
      method: 'POST',
      headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternHtml, priorMessages }),
    },
    'Chat session',
  );

  const data = await response.json();
  return data.sessionId;
};

export const sendChatMessage = async (
  sessionId: string,
  message: string,
  idToken: string,
): Promise<string> => {
  const response = await checkedFetch(
    `${getApiUrl()}/api/chat/message`,
    {
      method: 'POST',
      headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    },
    'Chat message',
  );

  const data = await response.json();
  return data.text;
};
