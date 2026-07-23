import { apiUrl, authHeaders } from './apiBase';

export interface AiTermResult {
  sourceAbbreviation: string;
  sourceFull: string;
  targetAbbreviation: string;
  targetFull: string;
  explanation: string;
}

export async function lookupTermWithAI(
  term: string,
  sourceLang: string,
  targetLang: string,
  idToken: string,
): Promise<AiTermResult> {
  const res = await fetch(apiUrl('/glossary/lookup'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(idToken),
    },
    body: JSON.stringify({ term, sourceLang, targetLang }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401) {
      throw new Error('You must be signed in to use assisted lookup.');
    }
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Assisted lookup failed. Please try again.',
    );
  }

  return res.json() as Promise<AiTermResult>;
}
