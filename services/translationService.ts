import type { TranslationResult } from '../types';
import { apiUrl, authHeaders } from './apiBase';
import { analyticsErrorCode, captureEvent } from './analytics';

class TranslationError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'server' | 'unknown',
    public readonly status?: number,
    public readonly code?: string,
    public readonly balance?: number,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export function normalizeTranslationErrorMessage(message: string): string {
  if (
    /prepayment credits? (?:are )?depleted/i.test(message)
    || /RESOURCE_EXHAUSTED/i.test(message)
    || /quota (?:has been )?exceeded/i.test(message)
  ) {
    return 'The translation service is temporarily unavailable because its provider quota has been exhausted. Your StitchSpeak credits were refunded. Please try again later.';
  }
  if (/^\s*(?:\{|\[)/.test(message) || /"error"\s*:/.test(message)) {
    return 'The translation service returned an unexpected error. Your StitchSpeak credits were refunded. Please try again later.';
  }
  return message;
}

async function checkedFetch(
  input: RequestInfo,
  init?: RequestInit,
  label = 'Request',
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, credentials: 'include' });
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
    const serverCode = typeof body?.code === 'string' ? body.code : undefined;
    const serverBalance = typeof body?.balance === 'number' ? body.balance : undefined;

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
    if (response.status === 409) {
      throw new TranslationError(
        serverMsg || 'A translation is already running. Wait for it to finish before starting another.',
        'server',
        409,
      );
    }
    if (response.status >= 500) {
      throw new TranslationError(
        normalizeTranslationErrorMessage(serverMsg || 'The server encountered an error. Please try again later.'),
        'server',
        response.status,
        serverCode,
        serverBalance,
      );
    }
    throw new TranslationError(
      normalizeTranslationErrorMessage(serverMsg || `${label} failed (${response.status}).`),
      'server',
      response.status,
      serverCode,
      serverBalance,
    );
  }

  return response;
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
  formData.append('aiAcknowledged', 'true');

  captureEvent('translation_started', {
    target_language: language,
    source_language: sourceLanguage ?? 'auto',
    file_type: file.type,
  });
  try {
    const response = await checkedFetch(
      apiUrl('/translate'),
      { method: 'POST', headers: authHeaders(idToken), body: formData },
      'Translation',
    );
    const result: TranslationResult = await response.json();
    captureEvent('translation_completed', { target_language: language, cost: result.cost });
    return result;
  } catch (err) {
    captureEvent('translation_failed', {
      target_language: language,
      error_code: analyticsErrorCode(err),
    });
    throw err;
  }
};

export interface TranslatePatternStreamCallbacks {
  /**
   * Called for every text delta received from the server. The accumulated
   * string is the live, raw HTML coming from Gemini. Image markers like
   * `[IMG_5]` will be visible until the final result arrives.
   */
  onDelta?: (delta: string, accumulated: string) => void;
  /**
   * Called when the server reports a pipeline phase worth showing, e.g.
   * "Retrying with stricter number lock…" during number-fidelity recovery.
   */
  onStatus?: (message: string, stage: string) => void;
  /** Anonymous flow id joining estimate, translation, save, and export analytics. */
  analyticsFlowId?: string;
}

interface NdjsonDeltaEvent {
  type: 'delta';
  text: string;
}

interface NdjsonDoneEvent {
  type: 'done';
  /** Full final HTML — present unless the server streamed it as `final` chunks. */
  html?: string;
  /** True when the final HTML arrived as `final` chunk events before `done`. */
  htmlChunked?: boolean;
  usage: TranslationResult['usage'];
  cost?: number;
  balance?: number;
  reviewWarnings?: TranslationResult['reviewWarnings'];
}

/**
 * A bounded slice of the settled final HTML. The server streams the (possibly
 * multi-megabyte, image-inlined) result as these chunks followed by a small
 * terminal `done`, so the terminal event is never one huge late write that a
 * proxy can cut mid-flight.
 */
interface NdjsonFinalEvent {
  type: 'final';
  chunk: string;
}

interface NdjsonErrorEvent {
  type: 'error';
  message: string;
  code?: string;
  status?: number;
  balance?: number;
}

interface NdjsonStatusEvent {
  type: 'status';
  stage: string;
  message: string;
}

type NdjsonEvent =
  | NdjsonDeltaEvent
  | NdjsonDoneEvent
  | NdjsonErrorEvent
  | NdjsonStatusEvent
  | NdjsonFinalEvent;

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
  captureEvent('translation_started', {
    target_language: language,
    source_language: sourceLanguage ?? 'auto',
    file_type: file.type,
    flow_id: callbacks.analyticsFlowId,
  });
  try {
    const result = await translatePatternStreamInner(file, language, idToken, sourceLanguage, callbacks);
    captureEvent('translation_completed', {
      target_language: language,
      cost: result.cost,
      flow_id: callbacks.analyticsFlowId,
    });
    return result;
  } catch (err) {
    captureEvent('translation_failed', {
      target_language: language,
      error_code: analyticsErrorCode(err),
      flow_id: callbacks.analyticsFlowId,
    });
    throw err;
  }
};

interface StreamTarget {
  url: string;
  headers: Record<string, string>;
}

/**
 * US9 AC3: where to send the long-running translate stream. The Vercel rewrite
 * that proxies `/api/*` to Railway has a documented 120-second maximum that
 * cannot cover a ~4-minute translation, so the client first mints a short-lived
 * stream token over the rewrite (fast; HttpOnly cookie auth works same-origin)
 * and, when the server advertises a direct origin, streams straight against it
 * with the token as the Bearer credential. Any failure here — older server
 * without the endpoint, no direct origin configured, network hiccup — falls
 * back to the same-origin rewrite exactly as before.
 */
const resolveStreamTarget = async (idToken: string | null): Promise<StreamTarget> => {
  const fallback: StreamTarget = { url: apiUrl('/translate'), headers: authHeaders(idToken) };
  try {
    const response = await fetch(apiUrl('/translate/stream-token'), {
      method: 'POST',
      headers: authHeaders(idToken),
      credentials: 'include',
    });
    if (!response.ok) return fallback;
    const data = await response.json().catch(() => null);
    const token = typeof data?.token === 'string' ? data.token : null;
    const directOrigin =
      typeof data?.directOrigin === 'string' && /^https?:\/\//.test(data.directOrigin)
        ? data.directOrigin.replace(/\/+$/, '')
        : null;
    if (token && directOrigin) {
      return {
        url: `${directOrigin}/api/translate`,
        headers: { Authorization: `Bearer ${token}` },
      };
    }
  } catch {
    // Token minting is best-effort; the rewrite path still works for jobs
    // that finish inside the proxy window.
  }
  return fallback;
};

const translatePatternStreamInner = async (
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
  formData.append('aiAcknowledged', 'true');
  // Ask the server to deliver the final HTML as bounded `final` chunk events
  // followed by a small terminal `done` (US9). Older servers ignore the flag
  // and keep sending the full HTML inline on `done`.
  formData.append('streamFinalChunks', 'true');

  const target = await resolveStreamTarget(idToken);
  const response = await checkedFetch(
    target.url,
    {
      method: 'POST',
      headers: {
        ...target.headers,
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
  let finalHtmlChunks = '';
  let finalResult: TranslationResult | null = null;
  let streamError: NdjsonErrorEvent | null = null;

  const handleEvent = (event: NdjsonEvent): void => {
    switch (event.type) {
      case 'delta': {
        const text = event.text;
        if (typeof text !== 'string' || text.length === 0) return;
        accumulated += text;
        callbacks.onDelta?.(text, accumulated);
        return;
      }
      case 'final': {
        if (typeof event.chunk === 'string') finalHtmlChunks += event.chunk;
        return;
      }
      case 'done': {
        // The final HTML arrives either inline on `done` (older servers) or as
        // the `final` chunks streamed just before it. An empty result in both
        // is treated like a missing `done`: never a silent empty success.
        const html = typeof event.html === 'string' && event.html.length > 0
          ? event.html
          : finalHtmlChunks;
        if (html.length === 0) return;
        finalResult = {
          html,
          usage: event.usage ?? null,
          cost: event.cost,
          balance: event.balance,
          reviewWarnings: event.reviewWarnings ?? [],
        };
        return;
      }
      case 'error': {
        streamError = event;
        return;
      }
      case 'status': {
        if (typeof event.message === 'string' && event.message.length > 0) {
          callbacks.onStatus?.(event.message, event.stage);
        }
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
    const failure = streamError as NdjsonErrorEvent;
    throw new TranslationError(
      normalizeTranslationErrorMessage(failure.message || 'Translation failed.'),
      'server',
      failure.status,
      failure.code,
      failure.balance,
    );
  }

  if (!finalResult) {
    // The stream ended without a `done` event. Never salvage the accumulated
    // deltas as a success: raw streamed HTML has not passed number-fidelity
    // enforcement (or any other finalization), so presenting it would risk
    // exactly the silent wrong numbers the pipeline exists to prevent.
    throw new TranslationError(
      'Translation ended unexpectedly. Please try again.',
      'server',
    );
  }

  return finalResult;
};

export const startChatSession = async (
  patternId: string,
  idToken: string,
): Promise<string> => {
  const response = await checkedFetch(
    apiUrl('/chat/start'),
    {
      method: 'POST',
      headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternId }),
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
): Promise<{ text: string; messageCount: number; maxMessages: number }> => {
  const response = await checkedFetch(
    apiUrl('/chat/message'),
    {
      method: 'POST',
      headers: { ...authHeaders(idToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message }),
    },
    'Chat message',
  );

  const data = await response.json();
  captureEvent('chat_message_sent', { messages: data.messageCount });
  return {
    text: data.text,
    messageCount: data.messageCount,
    maxMessages: data.maxMessages,
  };
};
