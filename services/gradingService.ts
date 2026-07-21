import type { GradingExplanation, GradingRequestInput, GradingResult } from '../types';
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
