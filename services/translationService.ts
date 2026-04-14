import type { TranslationResult } from '../types';

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || '';
}

export const translatePattern = async (
  file: File,
  language: string,
): Promise<TranslationResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', language);

  const response = await fetch(`${getApiUrl()}/api/translate`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Translation failed.');
  }

  return response.json();
};

export const startChatSession = async (
  patternHtml: string,
): Promise<string> => {
  const response = await fetch(`${getApiUrl()}/api/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patternHtml }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Failed to start chat session.');
  }

  const data = await response.json();
  return data.sessionId;
};

export const sendChatMessage = async (
  sessionId: string,
  message: string,
): Promise<string> => {
  const response = await fetch(`${getApiUrl()}/api/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Failed to send chat message.');
  }

  const data = await response.json();
  return data.text;
};
