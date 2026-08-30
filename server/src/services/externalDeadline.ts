export class ExternalServiceTimeoutError extends Error {
  readonly status = 504;

  constructor(service: string) {
    super(`${service} took too long to respond. Please try again.`);
    this.name = 'ExternalServiceTimeoutError';
  }
}

export interface ExternalErrorDetails {
  status: number;
  code: string;
  message: string;
}

function errorText(error: unknown): string {
  const chunks: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) chunks.push(current.message);
    else if (typeof current === 'string') chunks.push(current);
    else {
      try { chunks.push(JSON.stringify(current)); } catch { /* ignore */ }
    }
    current = typeof current === 'object' && current !== null
      ? (current as { cause?: unknown }).cause
      : null;
  }
  return chunks.join('\n');
}

export function isProviderBillingExhausted(error: unknown): boolean {
  return /prepayment credits? (?:are )?depleted|manage your project and billing/i.test(errorText(error));
}

export function externalErrorDetails(error: unknown): ExternalErrorDetails {
  if (error instanceof ExternalServiceTimeoutError) {
    return { status: 504, code: 'EXTERNAL_SERVICE_TIMEOUT', message: error.message };
  }

  const text = errorText(error);
  if (
    isProviderBillingExhausted(error)
    || /RESOURCE_EXHAUSTED/i.test(text)
    || /quota (?:has been )?exceeded/i.test(text)
  ) {
    return {
      status: 503,
      code: 'PROVIDER_QUOTA_EXHAUSTED',
      message: 'The AI service is temporarily unavailable because its provider quota has been exhausted. Please try again later.',
    };
  }
  if (/\b(?:429|Too Many Requests)\b/i.test(text)) {
    return {
      status: 503,
      code: 'PROVIDER_RATE_LIMITED',
      message: 'The AI service is temporarily busy. Please wait a moment and try again.',
    };
  }
  return {
    status: 500,
    code: 'EXTERNAL_SERVICE_ERROR',
    message: 'The AI service could not complete the request. Please try again later.',
  };
}

export async function withExternalDeadline<T>(
  service: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await operation(signal);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) {
      throw new ExternalServiceTimeoutError(service);
    }
    throw error;
  }
}

export function externalErrorStatus(error: unknown): number {
  return externalErrorDetails(error).status;
}
