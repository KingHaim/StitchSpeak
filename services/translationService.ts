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
