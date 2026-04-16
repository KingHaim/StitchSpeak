export interface AiTermResult {
  sourceAbbreviation: string;
  sourceFull: string;
  targetAbbreviation: string;
  targetFull: string;
  explanation: string;
}

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || '';
}

export async function lookupTermWithAI(
  term: string,
  sourceLang: string,
  targetLang: string,
  idToken: string,
): Promise<AiTermResult> {
  const res = await fetch(`${getApiUrl()}/api/glossary/lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ term, sourceLang, targetLang }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401) {
      throw new Error('You must be signed in to use AI lookup.');
    }
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'AI lookup failed. Please try again.',
    );
  }

  return res.json() as Promise<AiTermResult>;
}
